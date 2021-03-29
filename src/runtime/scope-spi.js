export default async function (scope, runtime) {
  if (!scope.store) {
    scope.store = await runtime.openStore("memory", scope.key);
  }
  if (!scope.stereotype) {
    scope.stereotype = "scope";
  }

  return {
    subscribe(subscriptionSpec) {
      console.log("subscribing scope %s to ", scope.key, subscriptionSpec);
      return {};
    },
    async queryInContext(expression, options, context) {
      console.log("executing query ", expression, options, context);
      try {
        const state = await scope.store.loadState(context);

        // apply selector
        return [
          state
            .selector(options.selector)
            .query(expression)
            .track(tracker => {
              //TODO: apply permissions to watcher
              return tracker;
            }),
          null,
        ];
      } catch (err) {
        return [null, err];
      }
    },
    async executeInContext(action, data, fn, context, options = {}) {
      console.log("executing action in security scope");

      try {
        // TODO: check if action is supported
        // TODO: check if all permissions are satisfied

        const state = await scope.store.loadState(context);
        const draft = state.draft();

        // execute the fn, injecting all helpers and errors
        const errors = {
          ActionError,
        };

        const result = await fn({ ...action, data }, draft, { helpers: scope.helpers, errors });

        // commit state if action is not read-only
        if (!options.readOnly) {
          state.commit(draft);
        }

        return [result, null];
      } catch (err) {
        return [null, err];
      }
    },
  };
}
