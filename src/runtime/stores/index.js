import oh from "object-hash";
import lodash from "lodash";
import memoryStore from "./memory.js";

const { map } = lodash;

export default function (runtime) {
  let prevHash = null;

  runtime.config.changes.subscribe(cfg => {
    if (cfg.stores) {
      const newHash = oh(cfg.stores || {});
      if (prevHash !== newHash) {
        map(cfg.stores, async (cfg, key) => {
          const store = await runtime.registry.findComponent({ stereotype: "store", key });
          if (!store) {
            if (cfg.type === "memory") {
              console.log("creating store %s with config", key, cfg);
              const store = await memoryStore(key, cfg, runtime);
              runtime.events.next({ key: "component:installed:new", component: store });
            } else {
              throw new Error("unsupported store type:" + cfg.type);
            }
          } else {
            console.log("configuring existing store %s with config", key, cfg, store);
          }
        });
        prevHash = newHash;
      }
    }
  });
}
