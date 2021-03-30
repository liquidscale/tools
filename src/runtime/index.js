import { Subject } from "rxjs";
import { filter } from "rxjs/operators/index.js";
import shortid from "shortid-36";
import { loader } from "./loader.js";
import compiler from "./compiler.js";
import installer from "./installer.js";
import uninstaller from "./uninstaller.js";
import { fileSystemBundle } from "./fs-bundle.js";
import vm from "vm";
import sandbox from "./sandbox.js";
import configSpi from "./config-spi.js";
import schemaSpi from "./schema-spi.js";
import scopeSpi from "./scope-spi.js";
import actionSpi from "./action-spi.js";
import registry from "./registry.js";
import config from "./config.js";
import health from "./health.js";
import gateways from "./gateways/index.js";
import transports from "./transports/index.js";
import stores from "./stores/index.js";
import world from "./scopes/world.js";
import organization from "./scopes/organization.js";
import cluster from "./scopes/cluster.js";
import security from "./scopes/security.js";
import library from "./scopes/library.js";
import systems from "./scopes/systems.js";
import user from "./scopes/user.js";
import device from "./scopes/device.js";
import matcher from "matcher";
import memoryStore from "./stores/memory.js";
import lodash from "lodash";

const { get } = lodash;

export function runtimeFactory(options = {}) {
  // This is the internal api of the runtime instance.
  const events = new Subject();
  const actions = new Subject();
  const queries = new Subject();

  const activeStores = {};

  const spi = {
    id: shortid.generate(),
    events,
    actions: {
      subscribe(pattern, observer) {
        console.log("registering action handler", pattern);
        return actions.pipe(filter(action => matcher.isMatch(action.key, pattern))).subscribe(observer);
      },
      execute(action) {
        return actions.next(action);
      },
    },
    queries: {
      subscribe(scopePattern, observer) {
        return queries.pipe(filter(query => matcher.isMatch(query.scope, scopePattern))).subscribe(observer);
      },
      execute(query) {
        return queries.next(query);
      },
    },
    config: config(events, options),
    new(code) {
      const script = new vm.Script(code);
      try {
        const context = vm.createContext(sandbox(this));
        script.runInContext(context);
        if (context.exports.default) {
          return context.exports.default;
        } else {
          return context.exports;
        }
      } catch (err) {
        console.error("runtime error", err);
      }
    },
    wrapScope(scope, initialState, api = {}) {
      return scopeSpi(Object.assign(scope, api), this, initialState);
    },
    wrapConfig(cfg) {
      return configSpi(cfg, this);
    },
    schema(spec) {
      return schemaSpi(spec, this);
    },
    async openStore(type, key, config) {
      let store = get(activeStores, type + key);
      if (!store) {
        console.log("store %s:%s not found. create it with config", type, key, config);
        store = await this.createStore(type, key, config);
        activeStores[type + key] = store;
      }
      return store;
    },
    async createStore(type, key, config = {}) {
      if (type === "memory") {
        const store = await memoryStore(key, config, this);
        if (config.initialState) {
          console.log(store);
          await store.initState(config.initialState);
        }
        return store;
      } else {
        return null;
      }
    },
    wrapSchema(spec) {
      return schemaSpi(spec, this);
    },
    wrapAction(comp) {
      return actionSpi(comp.impl, this, comp);
    },
    findComponent(...args) {
      return this.registry.findComponent(...args);
    },
    findComponents(...args) {
      return this.registry.findComponents(...args);
    },
    async resolve(...args) {
      return this.registry.resolve(...args);
    },
    publishAll(publications) {},
    subscribeAll(subscriptions) {},
    dynamicPattern(scopeKey) {
      const idx = scopeKey.indexOf("/$");
      if (idx !== -1) {
        return `${scopeKey.substring(0, idx)}*`;
      } else {
        return scopeKey;
      }
    },
  };

  // initialize our component registry
  spi.registry = registry(spi);
  spi.health = health(spi);

  // connect our component handlers
  loader(spi);
  compiler(spi);
  installer(spi);
  uninstaller(spi);

  gateways(spi);
  transports(spi);
  stores(spi);

  // create standard scopes
  world(spi);
  organization(spi);
  security(spi);
  cluster(spi);
  library(spi);
  user(spi);
  device(spi);

  // load all system scopes, which will trigger all sub-components initialization like timers, triggers, effects, etc.
  systems(spi);

  // Return the public api for our runtime
  return {
    id: spi.id,
    events: events.asObservable(),
    subscribe(key, subscriber) {
      return events.pipe(filter(event => event.key === key)).subscribe(subscriber);
    },
    bundle(type, config) {
      if (type === "filesystem") {
        return fileSystemBundle(spi, config);
      } else {
        throw new Error("unsupported bundle type:" + type);
      }
    },
  };
}
