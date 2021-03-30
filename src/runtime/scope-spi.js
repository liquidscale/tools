import lodash from "lodash";

const { isFunction } = lodash;

export default async function (scope, runtime, initialState) {
  console.log("wrapping spi scope".gray, scope, initialState);
  if (!scope.store) {
    console.log("initializing store for scope".gray, scope);
    scope.store = await runtime.createStore("memory", scope.key, { initialState });
  }
  if (!scope.stereotype) {
    scope.stereotype = "scope";
  }

  return {
    key: scope.key,
    stereotype: scope.steteotype || "scope",
    helpers: scope.helpers || {},
    errors: runtime.errors,
    subscribe(subscriptionSpec) {
      console.log("subscribing scope %s to ", scope.key, subscriptionSpec);
      return {};
    },
    async applyConfig(cfg) {
      console.log("applying config to scope %s".gray, scope.key, cfg);
      scope.config = cfg;
      // push config to store
      if (scope.store && isFunction(scope.store.applyConfig)) {
        await scope.store.applyConfig(cfg);
      }
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
      console.log("executing action in scope %s", scope.key);

      try {
        // TODO: check if action is supported
        // TODO: check if all permissions are satisfied

        const state = await scope.store.loadState(context);
        const draft = state.draft();

        // execute the fn, injecting all helpers and errors
        const result = await fn({ ...action, data }, draft, { helpers: scope.helpers, errors: runtime.errors });

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
