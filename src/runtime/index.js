import { Subject } from "rxjs";
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
import oh from "object-hash";
import lodash from "lodash";
import health from "./health.js";

const { map } = lodash;

export function runtimeFactory(options = {}) {
  // This is the internal api of the runtime instance.
  const events = new Subject();

  const spi = {
    id: shortid.generate(),
    events,
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

  const configHashes = {};

  // connect all gateways
  spi.config.changes.subscribe(cfg => {
    if (cfg.gateways) {
      const newHash = oh(cfg.gateways || {});
      const prevHash = configHashes.gateways;
      if (prevHash !== newHash) {
        map(cfg.gateways, async (cfg, key) => {
          const gateway = await spi.registry.findComponent({ stereotype: "gateway", key });
          if (!gateway) {
            console.log("creating gateway %s with config", key, cfg, gateway);
          } else {
            console.log("configuring existing gateway %s with config", key, cfg);
          }
        });
        configHashes.gateways = newHash;
      }
    }
  });

  spi.config.changes.subscribe(cfg => {
    if (cfg.transports) {
      const newHash = oh(cfg.transports || {});
      const prevHash = configHashes.transports;
      if (prevHash !== newHash) {
        map(cfg.transports, async (cfg, key) => {
          const transport = await spi.registry.findComponent({ stereotype: "transport", key });
          if (!transport) {
            console.log("creating transport %s with config", key, cfg);
          } else {
            console.log("configuring existing transport %s with config", key, cfg);
          }
        });
        configHashes.transports = newHash;
      }
    }
  });

  spi.config.changes.subscribe(cfg => {
    if (cfg.stores) {
      const newHash = oh(cfg.stores || {});
      const prevHash = configHashes.stores;
      if (prevHash !== newHash) {
        map(cfg.stores, async (cfg, key) => {
          const store = await spi.registry.findComponent({ stereotype: "store", key });
          if (!store) {
            console.log("creating store %s with config", key, cfg);
          } else {
            console.log("configuring existing store %s with config", key, cfg);
          }
        });
        configHashes.stores = newHash;
      }
    }
  });

  // create world scope
  // create organization scope
  // create security scope
  // create cluster scope (kubernetes api or virtual cluster)
  // create media library scope (file uploading, processing, serving and handling)

  // Return the public api for our runtime
  return {
    events: events.asObservable(),
    start() {
      // connect all transports, gateways, stores and start runnable scopes
    },
    stop() {
      // disconnect all transports, gateways, stores
    },
    deploy(root, options) {
      return fileSystemBundle(spi)(root, options);
    },
  };
}
