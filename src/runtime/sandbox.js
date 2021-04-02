import lodash from "lodash";

const { isString } = lodash;

export default function (runtime) {
  return {
    provide: function (fn) {
      const safeRT = {
        system(key) {
          const _system = {
            key,
            schema: null,
            finalizers: [],
            initializers: [],
            store: null,
            config: {},
            status: "pending",
          };

          // FIXME: put this into a system-scope component
          return {
            key,
            stereotype: "system",
            schema(key) {
              _system.schema = key;
            },
            initializer(fn) {
              _system.initializers.push(fn);
            },
            finalizer(fn) {
              _system.finalizers.push(fn);
            },
            store(key) {
              _system.store = key;
            },
            async getComponent() {
              return runtime.wrapScope(_system, {}, async scope => {
                console.log("initializing wrapped scope".cyan, scope.key);
                if (!_system.store) {
                  console.log("no configured scope, let's create a simple memory store");
                  scope.store = runtime.createStore("memory", _system.key);
                }

                if (isString(_system.store)) {
                  console.log("resolving store %s", _system.store);
                  scope.store = await runtime.resolve({ stereotype: "store", key: _system.store });
                  console.log("scope %s store was successfully resolved".green, scope.store);
                }

                // Run all initializers to build initial state
                if (_system.initializers.length > 0) {
                  const state = await scope.store.loadState();
                  console.log("initializing state for %s:%s", scope.stereotype, scope.key, state);
                  const draft = state.draft();
                  try {
                    const context = { scope, console, config: scope.config, schema: scope.schema };
                    await Promise.all(_system.initializers.map(async initializer => initializer(draft, context)));
                    state.commit(draft);
                    console.log("all initializers were executed", state);
                  } catch (err) {
                    console.log("unable to initialize system %s".red, _system.key, err);
                    state.rollback(draft);
                  }
                }

                // publish all our publications
                // runtime.publishAll(_system.publications);
                // runtime.subscribeAll(_system.subscriptions);

                scope.waitForQueries(_system.key);

                // Add extra methods for system scopes
                scope.getStatus = () => _system.status;

                _system.status = "active";
                console.log("system %s successfully started".green, scope.key);
                return scope;
              });
            },
          };
        },
        scope(key) {
          const _scope = {
            key,
            finalizers: [],
            initializers: [],
            schema: null,
          };
          return {
            key,
            schema(key) {
              _scope.schema = key;
            },
            initializer(fn) {
              _scope.initializers.push(fn);
            },
            finalizer(fn) {
              _scope.finalizers.push(fn);
            },
            async getComponent() {
              return runtime.wrapScope(_scope, {}, async scope => {
                console.log("initializing scope".cyan, scope.key);
                if (!_scope.store) {
                  console.log("no configured store, let's create a simple memory store");
                  scope.store = runtime.createStore("memory", scope.key);
                }

                if (isString(_scope.store)) {
                  console.log("resolving store %s", _scope.store);
                  scope.store = await runtime.resolve({ stereotype: "store", key: _scope.store });
                  console.log("scope %s store was successfully resolved".green, scope.store);
                }

                // Run all initializers to build initial state
                if (_scope.initializers.length > 0) {
                  const state = await scope.store.loadState();
                  console.log("initializing state for %s:%s", scope.stereotype, scope.key, state);
                  const draft = state.draft();
                  try {
                    const context = { scope, console, config: scope.config, schema: scope.schema };
                    await Promise.all(_scope.initializers.map(async initializer => initializer(draft, context)));
                    state.commit(draft);
                    console.log("all initializers were executed", state);
                  } catch (err) {
                    console.log("unable to initialize system %s".red, scope.key, err);
                    state.rollback(draft);
                  }
                }

                scope.waitForQueries(scope.key);

                console.log("scope %s successfully loaded".green, scope.key);
                return scope;
              });
            },
          }; // scope instance
        },
      };
      return fn(safeRT);
    },
    exports: {},
  };
}
