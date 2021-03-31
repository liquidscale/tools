import lodash from "lodash";

const { isFunction } = lodash;

const queryTrackers = {};

export default async function (scope, runtime, initialState, cstor) {
  console.log("wrapping spi scope".gray, scope, initialState);
  if (!scope.store) {
    console.log("initializing store for scope".gray, scope);
    scope.store = await runtime.createStore("memory", scope.key, { initialState });
  }
  if (!scope.stereotype) {
    scope.stereotype = "scope";
  }

  const _api = {
    key: scope.key,
    stereotype: scope.steteotype || "scope",
    helpers: scope.helpers || {},
    errors: runtime.errors,
    config: runtime.wrapConfig(scope.config),
    schema: runtime.wrapSchema(scope.schema),
    store: scope.store,
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
    async queryInContext(selector, expression, options, context) {
      console.log("executing query ", selector, expression, options, context);
      try {
        const state = await this.store.loadState(context);
        console.log("execute query on data", selector, expression, state, context);

        // apply selector
        return [state.selector(selector).query(expression).track(), null];
      } catch (err) {
        return [null, err];
      }
    },
    async executeInContext(action, data, fn, context, options = {}) {
      console.log("executing action in scope %s", this.key);

      try {
        // TODO: check if action is supported
        // TODO: check if all permissions are satisfied

        const state = await this.store.loadState(context);
        const draft = state.draft();

        // execute the fn, injecting all helpers and errors
        const result = await fn({ ...action, data }, draft, { helpers: this.helpers, errors: runtime.errors });

        // commit state if action is not read-only
        if (!options.readOnly) {
          state.commit(draft);
        }

        return [result, null];
      } catch (err) {
        return [null, err];
      }
    },
    waitForQueries(pattern, { secure = true } = {}) {
      return runtime.queries.subscribe(pattern, async query => {
        if (secure && !query.context.actor) {
          return query.channel.error({ message: "unauthorized", code: 401 });
        }

        try {
          if (query.op === "open") {
            console.log("executing query on %s scope", this.key, query);

            // handle dynamic scopes... loadScope if dynamic ?

            // create subscription on this scope with the provided context and selector
            const [queryTracker, error] = await this.queryInContext(query.selector, query.expression, query.options, query.context);
            if (queryTracker) {
              // register subscription (query id, subscription)
              console.log("tracker", queryTracker);
              queryTrackers[query.id] = { queryTracker, subscription: queryTracker.results.subscribe(result => query.channel.emit(result)) };
            } else {
              throw error;
            }
          } else if (query.op === "snapshot") {
            console.log("get query snapshot");

            // handle dynamic scopes... loadScope if dynamic ?

            const queryTracker = this.queryInContext(query.selector, query.expression, query.options, query.context);
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
    },
  };

  if (isFunction(cstor)) {
    return await cstor(_api);
  } else {
    return _api;
  }
}
