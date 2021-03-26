import { filter } from "rxjs/operators/index.js";
import oh from "object-hash";

export default function (runtime) {
  const _scope = {
    key: "user/$username",
    stereotype: "scope",
    impl: {},
  };

  let startSubscription = null;
  let prevHash = null;

  runtime.config.changes.subscribe(async cfg => {
    const newHash = oh(cfg.user || {});
    if (prevHash !== newHash) {
      console.log("configuring user scope", cfg.user || {});
      if (startSubscription) {
        startSubscription.unsubscribe();
      }

      const targetScope = await runtime.registry.findComponent({ stereotype: _scope.stereotype, key: _scope.key });
      if (!targetScope) {
        startSubscription = runtime.events.pipe(filter(event => event.key === "runtime:start")).subscribe(() => {
          console.log("starting user scope");
          runtime.queries.subscribe(runtime.dynamicPattern(_scope.key), query => {
            console.log("executing query on user scope", query);

            if (!query.context.actor) {
              query.channel.error({ message: "unauthorized", code: 401 });
            }

            // instantiate the target scope for the specified user

            // create subscription on this scope with the provided context and selector

            // retrieve the subscription state and produce a result message

            // produce an error message if something wrong happens
          });
        });
        runtime.events.next({ key: "component:installed:new", component: _scope });
      } else {
        //TODO: apply new configuration to organization instance
        runtime.events.next({ key: "component:installed:updated", component: _scope });
      }

      prevHash = newHash;
    }
  });
}
