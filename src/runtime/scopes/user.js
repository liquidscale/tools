import oh from "object-hash";

export default function (runtime) {
  const queryTrackers = {};

  const _scope = {
    key: "user/$username",
    stereotype: "scope",
    async loadScope(key) {
      console.log("loading dynamic user scope", `user/${key}`);
      return runtime.wrapScope({ key: `user/${key}`, stereotype: "scope" }, { username: key });
    },
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
        runtime.queries.subscribe(runtime.dynamicPattern(_scope.key), async query => {
          if (!query.context.actor) {
            return query.channel.error({ message: "unauthorized", code: 401 });
          }

          try {
            if (query.op === "open") {
              console.log("executing query on user scope", query);

              // instantiate the target scope for the specified user
              const userScope = await _scope.loadScope(query.context.actor);

              // create subscription on this scope with the provided context and selector
              const [queryTracker, error] = await userScope.queryInContext(query.expression, query.options, query.context);
              if (queryTracker) {
                // register subscription (query id, subscription)
                console.log("tracker", queryTracker);
                queryTrackers[query.id] = { queryTracker, subscription: queryTracker.results.subscribe(result => query.channel.emit(result)) };
              } else {
                throw error;
              }
            } else if (query.op === "snapshot") {
              console.log("get query snapshot");

              // instantiate the target scope for the specified user
              const userScope = await targetScope.loadScope(query.context.actor);
              const queryTracker = userScope.queryInContext(query.expression, query.options, query.context);
              query.channel.emit(queryTracker.snapshot());
              queryTracker.complete();
            } else if (query.op === "close") {
              console.log("closing query", query.id);
              const { queryTracker, subscription } = queryTrackers[query.id];
              if (subscription) {
                subscription.unsubscribe();
                queryTracker.complete();
              }
            }
          } catch (err) {
            console.error(err);
            query.channel.error(err);
          }
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
