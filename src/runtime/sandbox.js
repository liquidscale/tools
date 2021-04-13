import lodash from "lodash";

const { isString } = lodash;

export default function (runtime) {
  const log = runtime.logger.child({ module: "sandbox" });

  return {
    provide: function (fn) {
      const safeRT = {
        console,
        system(key, { autoCreate = true } = {}) {
          const _system = {
            key,
            schema: null,
            finalizers: [],
            initializers: [],
            constraints: [],
            publications: {},
            store: null,
            config: {},
            status: "pending",
            autoCreate,
          };

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
            store(key, opts = {}) {
              _system.store = key;
              _system.storeOpts = opts || {};
              _system.storeOpts.prefix = _system.storeOpts.prefix || "system";
            },
            constraint(spec, fn) {
              _system.constraints.push({ spec, fn });
            },
            publication(key, spec) {
              _system.publications[key] = { ...spec, key };
            },
            async getComponent() {
              return runtime.wrapScope(_system, {}, async scope => {
                log.debug("initializing wrapped scope".cyan, scope.key);
                if (!_system.store) {
                  log.debug("no configured scope, let's create a simple memory store");
                  scope.store = runtime.createStore("memory", _system.key);
                }

                if (isString(_system.store)) {
                  log.debug("creating store", _system.store, scope.key, _system.storeOpts);
                  scope.store = await runtime.createStore(_system.store, scope.key, _system.storeOpts || {});
                }

                // Run all initializers to build initial state
                if (_system.initializers.length > 0) {
                  const state = await scope.store.loadState();
                  const draft = state.draft();
                  try {
                    const context = { scope: scope.getPlatformApi(), console, ...runtime.platform, config: scope.config, schema: scope.schema };
                    await Promise.all(_system.initializers.map(async initializer => initializer(draft, context)));
                    state.commit(draft);
                  } catch (err) {
                    log.debug("unable to initialize system %s".red, _system.key, err);
                    state.rollback(draft);
                  }
                }

                // Add extra methods for system scopes
                scope.getStatus = () => _system.status;

                _system.status = "active";
                log.debug("system %s successfully started".green, scope.key);
                return scope;
              });
            },
          };
        },
        scope(key, { autoCreate = true } = {}) {
          const _scope = {
            key,
            finalizers: [],
            initializers: [],
            constraints: [],
            publications: {},
            schema: null,
            autoCreate,
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
            constraint(spec, fn) {
              _scope.constraints.push({ spec, fn });
            },
            publication(key, spec) {
              _scope.publications[key] = { ...spec, key };
            },
            store(key, opts = {}) {
              _scope.store = key;
              _scope.storeOpts = opts || {};
              _scope.storeOpts.prefix = _scope.storeOpts.prefix || _scope.key;
            },
            async getComponent() {
              return runtime.wrapScope(_scope, {}, async scope => {
                log.debug("initializing scope".cyan, scope.key);
                if (!_scope.store) {
                  log.debug("no configured store, let's create a simple memory store");
                  scope.store = runtime.createStore("memory", scope.key);
                }

                if (isString(_scope.store)) {
                  log.debug("creating store", _scope.store, scope.key, _scope.storeOpts);
                  scope.store = await runtime.createStore(_scope.store, scope.key, _scope.storeOpts || {});
                }

                // Run all initializers to build initial state
                if (_scope.initializers.length > 0) {
                  const state = await scope.store.loadState();
                  log.debug("initializing state for %s:%s", scope.stereotype, scope.key, state);
                  const draft = state.draft();
                  try {
                    const context = { scope: scope.getPlatformApi(), console, ...runtime.platform, config: scope.config, schema: scope.schema };
                    await Promise.all(_scope.initializers.map(async initializer => initializer(draft, context)));
                    state.commit(draft);
                  } catch (err) {
                    log.debug("unable to initialize system %s".red, scope.key, err);
                    state.rollback(draft);
                  }
                }

                log.debug("scope %s successfully loaded".green, scope.key);
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
