import { filter } from "rxjs/operators/index.js";
import oh from "object-hash";

export default function (runtime) {
  const _scope = {
    key: "library",
    stereotype: "scope",
    impl: {},
  };

  let startSubscription = null;
  let prevHash = null;

  runtime.config.changes.subscribe(async cfg => {
    const newHash = oh(cfg.library || {});
    if (prevHash !== newHash) {
      console.log("configuring library scope", cfg.library || {});
      if (startSubscription) {
        startSubscription.unsubscribe();
      }

      const targetScope = await runtime.registry.findComponent({ stereotype: _scope.stereotype, key: _scope.key });
      if (!targetScope) {
        startSubscription = runtime.events.pipe(filter(event => event.key === "runtime:start")).subscribe(() => {
          console.log("starting library scope");
        });
        runtime.events.next({ key: "component:installed:new", component: _scope });
      } else {
        //TODO: apply new configuration to library instance
        runtime.events.next({ key: "component:installed:updated", component: _scope });
      }

      prevHash = newHash;
    }
  });
}
