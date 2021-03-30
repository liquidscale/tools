import { filter } from "rxjs/operators/index.js";
import oh from "object-hash";

export default function (runtime) {
  const _world = {
    key: "world",
    stereotype: "scope",
  };

  let startSubscription = null;
  let prevHash = null;

  runtime.config.changes.subscribe(async cfg => {
    const newHash = oh(cfg.world || {});
    if (prevHash !== newHash) {
      console.log("configuring world scope", cfg.world || {});
      if (startSubscription) {
        startSubscription.unsubscribe();
      }

      const world = await runtime.registry.findComponent({ stereotype: "scope", key: "world" });
      if (!world) {
        console.log("starting world scope");
        runtime.events.next({ key: "component:installed:new", component: _world });
      } else {
        //TODO: apply new configuration to world instance
        runtime.events.next({ key: "component:installed:updated", component: _world });
      }

      prevHash = newHash;
    }
  });
}
