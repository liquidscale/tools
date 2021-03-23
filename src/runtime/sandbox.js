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
            getComponent() {
              return {
                key: this.key,
                getStatus() {
                  return _system.status;
                },
                stereotype: this.stereotype,
                applyConfig(cfg) {
                  _system.config = cfg;
                },
                async start() {
                  console.log("starting system".cyan, _system.key);
                  let store = null;

                  if (_system.store) {
                    try {
                      store = await runtime.resolve({ stereotype: "store", key: _system.store });
                      _system.state = await store.initState({});
                    } catch (err) {
                      console.error("unable to resolve store %s: %s".red, _system.store, err.message);
                    }
                  }

                  if (!_system.state) {
                    _system.state = {
                      data: {},
                      draft() {
                        return {};
                      },
                      commit(draft) {
                        this.data = draft;
                      },
                      rollback() {
                        return this.data;
                      },
                    };
                  }

                  // Run all initializers to build initial state
                  const initializers = [..._system.initializers, ...(await runtime.findComponents({ stereotype: "initializer", scope: _system.key }))];
                  if (initializers.length > 0) {
                    const draft = _system.state.draft();
                    try {
                      const context = { scope: runtime.wrapScope(_system), config: runtime.wrapConfig(_system.config), schema: runtime.wrapSchema(_system.schema) };
                      initializers.map(initializer => initializer(draft, context));
                      _system.state.commit(draft);
                    } catch (err) {
                      _system.state.rollback(draft);
                    }
                  }

                  // Persist initial state
                  if (store) {
                    store.saveState(_system.state);
                  }

                  // publish all our publications
                  runtime.publishAll(_system.publications);
                  runtime.subscribeAll(_system.subscriptions);
                  runtime.actions.subscribe({ stereotype: "system", key: _system.key, version: _system.version }, function (action) {
                    console.log("executing action", action);
                  });
                  runtime.queries.subscribe({ stereotype: "system", key: _system.key, version: _system.version }, function (action) {
                    console.log("executing query", action);
                  });

                  _system.status = "active";
                  console.log("system %s successfully started".green, _system.key);
                },
              };
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
          }; // scope instance
        },
      };
      return fn(safeRT);
    },
    exports: {},
  };
}
