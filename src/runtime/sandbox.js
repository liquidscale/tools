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
            transports: [],
            gateways: [],
            store: null,
          };

          // FIXME: put this into a system-scope component
          return {
            key,
            runnable: true,
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
            transport(key) {
              _system.transports.push(key);
            },
            gateway(key) {
              _system.gateways.push(key);
            },
            store(key) {
              _system.store = key;
            },
            async start() {
              console.log("starting scope", _system);

              if (_system.store) {
                _system.state = await _system.store.initState({});
              } else {
                _system.state = {
                  data: {},
                  draft() {
                    return {};
                  },
                };
              }

              // Run all initializers to build initial state
              const initializers = await runtime.findComponents({ stereotype: "initializer", scope: _system.key });
              console.log("initializers", initializers);
              if (initializers.length > 0) {
                const draft = _system.state.draft();
                try {
                  console.log("creating initializer context");
                  const context = { scope: runtime.wrapScope(_system), config: runtime.wrapConfig(cfg), schema: runtime.wrapSchema(_system.schema) };
                  initializers.map(initializer => initializer(draft, context));
                  console.log("commit change");
                  _system.state.commit(draft);
                } catch (err) {
                  _system.state.rollback(draft);
                }
              }

              console.log("computed initial state ", _system.state);

              // Persist initial state
              if (_system.store) {
                _system.store.saveState(_system.state);
              }

              // connect transport
              _system.transports.map(transport => transport.connect());

              // connect gateway
              _system.gateways.map(gateway => gateway.connect(runtime.actions_()));

              // connects our subscribers and subcriptions to receive live changes from other scopes that feed services
              _system.transports.map(transport => transport.publish(_system.publications));
              _system.transports.map(transport => transport.subscribe(_system.subscriptions));

              // Add this scope as running in our virtual cluster
              runtime.getCluster().start(_system, true);
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
