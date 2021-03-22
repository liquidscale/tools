import redisTransport from "./redis/index.js";
import wsGateway from "./ws-gateway/index.js";
import rxStore from "./rx-store/index.js";
import lodash from "lodash";

const { isFunction } = lodash;

const mockedScopeModule = function (runtime) {
  return {
    provide: function (fn) {
      const config = function (factory) {
        if (isFunction(factory)) {
          const cfg = { version: "A001" }; // build config from various sources
          return factory(cfg, runtime);
        }
      };
      return fn(config);
    },
    system(key) {
      return function (cfg) {
        console.log("creating system scope with config", cfg);
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
          schema(key) {
            _system.schema = key;
          },
          initializer(fn) {
            _system.initializers.push(fn);
          },
          finalizer(fn) {
            _system.finalizers.push(fn);
          },
          transport(t) {
            console.log("push transport", t);
            _system.transports.push(t);
          },
          gateway(g) {
            _system.gateways.push(g);
          },
          store(s) {
            _system.store = s;
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
            const initializers = [..._system.initializers, ...(await runtime.findComponents({ stereotype: "initializer", scope: _system.key }))];
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
      };
    },
    scope(key) {
      return function (cfg) {
        console.log("creating scope with config", cfg);
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
      };
    },
  };
};

export default function (runtime) {
  return {
    exports: {},
    require(name) {
      switch (name) {
        case "@liquidscale/scope":
          return mockedScopeModule(runtime);
        case "@liquidscale/redis-transport":
          return function (cfg) {
            return redisTransport(cfg.redis || {}, runtime);
          };
        case "@liquidscale/ws-gateway":
          return function (cfg) {
            return wsGateway(cfg.gateway || {}, runtime);
          };
        case "@liquidscale/rx-store":
          return function (cfg) {
            return rxStore(cfg.store || {}, runtime);
          };
        default:
          throw new Error("unsupported module:" + name);
      }
    },
  };
}
