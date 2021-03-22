import oh from "object-hash";
import lodash from "lodash";
import ws from "./ws.js";

const { map } = lodash;

export default function (runtime) {
  let prevHash = null;

  runtime.config.changes.subscribe(cfg => {
    if (cfg.gateways) {
      const newHash = oh(cfg.gateways || {});
      if (prevHash !== newHash) {
        map(cfg.gateways, async (cfg, key) => {
          const gateway = await runtime.registry.findComponent({ stereotype: "gateway", key });
          if (!gateway) {
            console.log("creating gateway %s with config", key, cfg);
            if (cfg.type === "websocket") {
              const gateway = ws(key, cfg, runtime);
              runtime.events.next({ key: "component:installed:new", component: gateway });
            } else {
              throw new Error("unsupported gateway:" + cfg.type);
            }
          } else {
            console.log("UNSUPPORTED: configuring existing gateway %s with config", key, cfg, gateway);
          }
        });
        prevHash = newHash;
      }
    }
  });
}
