import oh from "object-hash";
import lodash from "lodash";
import memoryTransport from "./memory.js";

const { map } = lodash;

export default function (runtime) {
  let prevHash = null;

  runtime.config.changes.subscribe(cfg => {
    if (cfg.transports) {
      const newHash = oh(cfg.transports || {});
      if (prevHash !== newHash) {
        map(cfg.transports, async (cfg, key) => {
          const transport = await runtime.registry.findComponent({ stereotype: "transport", key });
          if (!transport) {
            console.log("creating transport %s with config", key, cfg);
            if (cfg.type === "memory") {
              const transport = memoryTransport(key, cfg, runtime);
              runtime.events.next({ key: "component:installed:new", component: transport });
            } else {
              throw new Error("unsupported transport:" + cfg.type);
            }
          } else {
            console.log("UNSUPPORTED: configuring existing transport %s with config", key, cfg, transport);
          }
        });
        prevHash = newHash;
      }
    }
  });
}
