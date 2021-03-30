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
              return runtime.wrapScope(
                _system,
                {},
                {
                  getStatus() {
                    return _system.status;
                  },
                  applyConfig(cfg) {
                    _system.config = cfg;
                  },
                  async start() {
                    console.log("starting system".cyan, _system.key);

                    if (!_system.store) {
                      _system.store = await runtime.createStore("memory", _system.key);
                    }

                    if (isString(_system.store)) {
                      _system.store = await runtime.resolve({ stereotype: "store", key: _system.store });
                    }

                    try {
                      _system.state = await _system.store.initState({});
                    } catch (err) {
                      console.error("unable to resolve store %s: %s".red, _system.store.key, err.message);
                    }

                    // Run all initializers to build initial state
                    const initializers = [..._system.initializers, ...(await runtime.findComponents({ stereotype: "initializer", scope: _system.key }))];
                    if (initializers.length > 0) {
                      const draft = _system.state.draft();
                      try {
                        const context = { scope: await runtime.wrapScope(_system), config: runtime.wrapConfig(_system.config), schema: runtime.wrapSchema(_system.schema) };
                        initializers.map(initializer => initializer(draft, context));
                        _system.state.commit(draft);
                      } catch (err) {
                        _system.state.rollback(draft);
                      }
                    }

                    // publish all our publications
                    runtime.publishAll(_system.publications);
                    runtime.subscribeAll(_system.subscriptions);
                    runtime.queries.subscribe(_system.key, function (query) {
                      console.log("executing query on system scope %s", _system.key, query);
                    });

                    _system.status = "active";
                    console.log("system %s successfully started".green, _system.key);
                  },
                }
              );
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
