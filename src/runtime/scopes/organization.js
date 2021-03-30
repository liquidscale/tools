import { filter } from "rxjs/operators/index.js";
import oh from "object-hash";

export default function (runtime) {
  const _scope = {
    key: "organization",
    stereotype: "scope",
    impl: {},
  };

  let startSubscription = null;
  let prevHash = null;

  runtime.config.changes.subscribe(async cfg => {
    const newHash = oh(cfg.organization || {});
    if (prevHash !== newHash) {
      console.log("configuring organization scope", cfg.organization || {});
      if (startSubscription) {
        startSubscription.unsubscribe();
      }

      const targetScope = await runtime.registry.findComponent({ stereotype: _scope.stereotype, key: _scope.key });
      if (!targetScope) {
        console.log("starting organization scope");
        runtime.events.next({ key: "component:installed:new", component: _scope });
      } else {
        //TODO: apply new configuration to organization instance
        runtime.events.next({ key: "component:installed:updated", component: _scope });
      }

      prevHash = newHash;
    }
  });
}
