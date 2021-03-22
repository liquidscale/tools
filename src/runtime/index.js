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

export function runtimeFactory(options = {}) {
  // This is the internal api of the runtime instance.
  const events = new Subject();
  const actions = new Subject();

  const spi = {
    id: shortid.generate(),
    events,
    actions,
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
    wrapScope(scope) {
      return scopeSpi(scope, this);
    },
    wrapConfig(cfg) {
      return configSpi(cfg, this);
    },
    wrapSchema(spec) {
      return schemaSpi(spec, this);
    },
    wrapAction(action, comp) {
      return actionSpi(action, this, comp);
    },
    async findComponent(...args) {
      return this.registry.findComponent(...args);
    },
    async findComponents(...args) {
      return this.registry.findComponents(...args);
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

  // create world scope
  // create organization scope
  // create security scope
  // create cluster scope (kubernetes api or virtual cluster)
  // create media library scope (file uploading, processing, serving and handling)

  // Return the public api for our runtime
  return {
    id: spi.id,
    events: events.asObservable(),
    subscribe(key, subscriber) {
      return events.pipe(filter(event => event.key === key)).subscribe(subscriber);
    },
    start() {
      console.log("starting runtime", spi.id);

      // connect all transports, gateways, stores and start runnable scopes
      events.next({ key: "runtime:start" });
    },
    stop() {
      console.log("stopping runtime", spi.id);

      // disconnect all transports, gateways, stores
      events.next({ key: "runtime:stop" });
    },
    deploymentBundle(type) {
      if (type === "filesystem") {
        return fileSystemBundle(spi);
      } else {
        throw new Error("unsupported bundle type:" + type);
      }
    },
  };
}
