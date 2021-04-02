import lodash from "lodash";
import Promise from "bluebird";
import shortid from "shortid-36";

const { isFunction, reduce } = lodash;

const queryTrackers = {};

export default async function (scope, runtime, initialState, cstor) {
  console.log("wrapping spi scope".gray, scope, initialState);

  if (!scope.stereotype) {
    scope.stereotype = "scope";
  }

  // Check if we have a dynamic scope
  const dynamic = scope.key.indexOf("${") !== -1;

  if (!scope.store && !dynamic) {
    console.log("initializing store for scope".gray, scope);
    scope.store = await runtime.createStore("memory", scope.key, { initialState });
  }

  const _api = {
    key: scope.key,
    stereotype: scope.steteotype || "scope",
    helpers: Object.assign(scope.helpers || {}, { idGen: () => shortid.generate() }),
    errors: runtime.errors,
    config: runtime.wrapConfig(scope.config),
    schema: runtime.wrapSchema(scope.schema),
    initializers: scope.initializers || [],
    finalizers: scope.finalizers || [],
    store: scope.store,
    async applyConfig(cfg) {
      console.log("applying config to scope %s".gray, scope.key, cfg);
      scope.config = cfg;
      // push config to store
      if (scope.store && isFunction(scope.store.applyConfig)) {
        await scope.store.applyConfig(cfg);
      }
    },
    subscribe(pubKey, subscriptionSpec) {
      console.log("subscribing to publication %s of scope %s ", pubKey, this.key, subscriptionSpec);
      return runtime.wrapSubscription(this, pubKey, subscriptionSpec);
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
      if (!Array.isArray(fn)) {
        fn = [fn];
      }

      try {
        // TODO: check if action is supported
        // TODO: check if all permissions are satisfied

        const state = await this.store.loadState(context);
        const draft = state.draft();

        // execute the fn, injecting all helpers and errors
        const result = await Promise.reduce(fn, (draft, f) => f({ ...action, data }, draft, { scope: _platformApi, helpers: this.helpers, console, errors: runtime.errors }), draft);

        // commit state if action is not read-only
        if (!options.readOnly) {
          console.log("committing changes to store", state);
          state.commit(draft);
        }

        return [result, null];
      } catch (err) {
        return [null, err];
      }
    },
    waitForQueries(pattern, { secure = true } = {}) {
      console.log("setting up query handling for scope", scope.key);
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

  const defaultSpec = {
    key: "default",
    stereotype: "publication",
    selector: "$",
    expression: null,
    options: {},
    context: {},
  };

  let publications = {};
  if (!dynamic) {
    publications = reduce(
      scope.publications || [],
      (pubs, pub) => {
        console.log("registering publication ", pub.key);
        pubs[pub.key] = runtime.wrapPublication(pub, _api);
        return pubs;
      },
      {
        default: runtime.wrapPublication(defaultSpec, _api),
      }
    );
  }

  /**
   * API provided when managed code is requesting scope access. This is a very limited implementation without direct
   * access to the scope methods and runtime
   */
  const _platformApi = {
    parent() {
      return { systemSubscription: "to-do" };
    },
    async spawn(scopeKey, initialState) {
      console.log("spawning child scope %s with initial state", scopeKey, initialState);
      const childScope = await runtime.dynamicScope(
        scopeKey,
        {
          subscriptions: [_api.subscribe("default", { parent: true })],
        },
        initialState,
        async dynScope => {
          console.log("initializing dynamic scope".cyan, dynScope);

          // Run all initializers to build initial state
          if (dynScope.initializers && dynScope.initializers.length > 0) {
            const state = await dynScope.store.loadState();
            console.log("initializing dynamic scope state for %s:%s", dynScope.stereotype, dynScope.key, state, dynScope.store);
            const draft = state.draft();
            try {
              const context = { scope: _platformApi, console, config: dynScope.config, schema: dynScope.schema };
              console.log("applying all initializers", state.id, dynScope.initializers);
              await Promise.all(dynScope.initializers.map(async initializer => initializer(draft, context)));
              console.log("all initializers were executed", state);
              state.commit(draft);
              console.log("after commit state", state);
            } catch (err) {
              console.log("unable to initialize system %s".red, dynScope.key, err);
              state.rollback(draft);
            }
          } else {
            console.log("No initializers to run for scope", dynScope.key);
          }

          dynScope.waitForQueries(dynScope.key);

          console.log("scope %s successfully loaded".green, dynScope.key);
          return dynScope;
        }
      );

      // keep track of this subscription in the parent scope
      const childSub = childScope.subscribe("default", { cache: true });

      // register this scope in our system
      runtime.events.next({ key: "component:installed:new", component: childScope });

      return {
        $ref: childSub.asRef(),
        ...initialState,
      };
    },
  };

  _api.using = function (pubKey, fn) {
    console.log("executing code within publication context", pubKey);
    const pub = publications[pubKey];
    console.log("resolved pub", pub);
    return pub.$.subscribe(state =>
      fn(state, {
        query(...args) {
          return _api.queryInContext(...args);
        },
        execute() {
          return _api.executeInContext(...args);
        },
      })
    );
  };

  if (dynamic) {
    console.log("registering a dynamic scope template", _api.key);
    _api.dynamicScope = async function (scopeSpec, data, dynamiCstor) {
      scopeSpec = scopeSpec || {};

      if (!scopeSpec.key) {
        scopeSpec.key = runtime.realizeKey(scope.key, data);
      }
      console.log("scope template is", scope);
      scopeSpec.config = scope.config;
      scopeSpec.schema = scope.schema;
      (scopeSpec.initializers || []).push(...(scope.initializers || []));
      (scopeSpec.finalizers || []).push(...(scope.finalizers || []));
      Object.assign(scopeSpec.helpers || {}, scope.helpers || {});

      console.log("instantiating dynamic scope ", { ...scope, ...scopeSpec, store: null }, data);
      return runtime.wrapScope({ ...scope, ...scopeSpec, store: null }, data, dynamiCstor || cstor);
    };
    return _api;
  } else if (isFunction(cstor)) {
    return await cstor(_api);
  } else {
    return _api;
  }
}
