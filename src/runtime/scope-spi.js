import lodash from "lodash";
import Promise from "bluebird";

const { isFunction, reduce, forEach, isUndefined } = lodash;

export default async function (scope, runtime, initialState, cstor) {
  const log = runtime.logger.child({ internal: true, module: "scope-spi", scope: scope.key });

  if (!scope.stereotype) {
    scope.stereotype = "scope";
  }

  if (isUndefined(scope.autoCreate)) {
    scope.autoCreate = true;
  }

  // Check if we have a dynamic scope
  const dynamic = scope.key.indexOf("${") !== -1;
  const mountpoints = {};
  let publications = {};

  if (!scope.store && !dynamic) {
    log.trace("initializing store for scope".gray, scope);
    scope.store = await runtime.createStore("memory", scope.key, { initialState });
  }

  const _api = {
    key: scope.key,
    stereotype: scope.steteotype || "scope",
    context: scope.context || {},
    helpers: Object.assign(scope.helpers || {}, { idGen: () => runtime.idGen() }),
    errors: runtime.errors,
    config: runtime.wrapConfig(scope.config),
    schema: runtime.wrapSchema(scope.schema),
    initializers: scope.initializers || [],
    finalizers: scope.finalizers || [],
    constraints: scope.constraints || [],
    store: scope.store,
    getPublication(key = "default") {
      return publications[key];
    },
    async applyConfig(cfg) {
      scope.config = cfg;
      // push config to store
      if (scope.store && isFunction(scope.store.applyConfig)) {
        await scope.store.applyConfig(cfg);
      }
    },
    subscribe(pubKey, subscriptionSpec) {
      log.debug("create-subscription: publication=%s, spec=", pubKey, subscriptionSpec);
      const targetPub = publications[pubKey];
      if (targetPub) {
        return runtime.wrapSubscription(this, targetPub, subscriptionSpec);
      } else {
        log.warn("trying to subscription to an unknown publication. skipping...", pubKey);
      }
    },
    async queryInContext(selector, expression, options, context) {
      try {
        const state = await this.store.loadState(context, this.constraints);

        // apply selector
        return [state.selector(selector).query(expression).track(), null];
      } catch (err) {
        return [null, err];
      }
    },
    async executeInContext(action, data, fn, context, options = {}) {
      if (!Array.isArray(fn)) {
        fn = [fn];
      }

      try {
        // TODO: check if action is supported

        const state = await this.store.loadState(context, this.constraints);
        const draft = state.draft();

        // TODO: check if all permissions are satisfied

        // execute the fn, injecting all helpers and errors
        const result = await Promise.reduce(
          fn,
          (draft, f) => f({ ...action, actor: { username: context.actor }, data }, draft, { scope: _platformApi, ...runtime.platform, helpers: this.helpers, console, errors: runtime.errors }),
          draft
        );

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

  const defaultSpec = {
    key: "default",
    stereotype: "publication",
    selector: "$",
    expression: null,
    options: {
      sort: null,
      projection: null,
    },
    context: {
      height: null,
      locale: null,
    },
  };

  if (!dynamic) {
    log.trace("initializing publications for scope %s", scope.key);
    publications = reduce(
      scope.publications || {},
      (pubs, pub) => {
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
      //TODO: Mount parent subscription reference
      return { systemSubscription: "to-do" };
    },
    async spawn(scopeKey, initialState, { cache = true } = {}) {
      const childScope = await runtime.dynamicScope(
        scopeKey,
        {
          subscriptions: [_api.subscribe("default", { parent: true })],
        },
        initialState,
        async dynScope => {
          // Run all initializers to build initial state
          if (dynScope.initializers && dynScope.initializers.length > 0) {
            const state = await dynScope.store.loadState();
            const draft = state.draft();
            try {
              const context = { scope: _platformApi, ...runtime.platform, console, config: dynScope.config, schema: dynScope.schema };
              await Promise.all(dynScope.initializers.map(async initializer => initializer(draft, context)));
              state.commit(draft);
            } catch (err) {
              log.error("unable to initialize system %s".red, dynScope.key, err);
              state.rollback(draft);
            }
          } else {
            log.debug("No initializers to run for scope", dynScope.key);
          }

          log.debug("scope %s successfully loaded".green, dynScope.key);
          return dynScope;
        }
      );

      // keep track of this subscription in the parent scope
      const childSub = childScope.subscribe("default", {
        cache: {
          data: initialState,
          excludes: ["messages"], //FIXME: use incoming cache params
        },
      });

      // register this scope in our system
      runtime.events.next({ key: "component:installed:new", component: childScope });

      return childSub.asRef();
    },
    subscribe(pubKey, subscriptionSpec) {
      log.debug("platform-api: subscribe", pubKey, subscriptionSpec);
      if (pubKey) {
        return _api.subscribe(pubKey, subscriptionSpec);
      } else {
        log.warn("empty subscription provided by client code. skipping.");
      }
    },
    mount(target, { mountpoint } = {}) {
      if (target) {
        target.$mountId = runtime.idGen();
        mountpoints[target.$mountId] = {
          target,
          subscription: target.subscribe(function mountpointObserver(data) {
            log.debug("mounted target %s(%s) has changed. We need to refresh all publications: %s. change =", mountpoint, target.$mountId, Object.keys(publications), data);
            forEach(publications, pub => pub.refresh(mountpoint, data));
          }),
        };
        return target;
      }
    },
    unmount(targetRef) {
      if (targetRef) {
        const mountpoint = mountpoints[targetRef.$ref];
        if (mountpoint && mountpoint.subscription) {
          mountpoint.subscription.unsubscribe();
          delete mountpoints[targetRef.$ref];
        } else {
          log.info("unmounted target", targetRef);
        }
      }
    },
    finalize(subscriptionRef) {
      log.debug("finalizing scope associated with subscription ref", subscriptionRef);
    },
  };

  _api.using = function (pubKey, fn) {
    log.info("executing code within publication context", pubKey);
    const pub = publications[pubKey];
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
  _api.getPlatformApi = function () {
    return _platformApi;
  };

  if (dynamic) {
    log.info("registering a dynamic scope template", _api.key);
    _api.dynamicScope = async function (scopeSpec, data, dynamiCstor) {
      scopeSpec = scopeSpec || {};

      if (!scopeSpec.key) {
        scopeSpec.key = runtime.realizeKey(scope.key, data);
      }
      scopeSpec.config = scope.config;
      scopeSpec.schema = scope.schema;
      (scopeSpec.initializers || []).push(...(scope.initializers || []));
      (scopeSpec.finalizers || []).push(...(scope.finalizers || []));
      (scopeSpec.constraints || []).push(...(scope.constraints || []));

      Object.assign(scopeSpec.helpers || {}, scope.helpers || {});
      return runtime.wrapScope({ ...scope, ...scopeSpec, store: null }, data, dynamiCstor || cstor);
    };

    const scopePattern = runtime.dynamicPattern(scope.key);

    // Let's listen for incoming queries or action requests and forward
    runtime.queries.subscribe(scopePattern, async query => {
      // resolve dynamic scope
      let dynScope = runtime.findComponent({ stereotype: "scope", key: query.scope });
      if (!dynScope && scope.autoCreate) {
        dynScope = await _api.dynamicScope({ key: query.scope, context: query.context }, {}, cstor);
        runtime.events.next({ key: "component:installed:new", component: dynScope });
      }

      if (dynScope) {
        // send query to dynscope through indicated publication
        const targetPub = dynScope.getPublication(query.target);
        if (targetPub) {
          targetPub.executeQuery(query);
        } else {
          query.channel.error({ message: "unknown publication", close: true });
        }
      } else {
        query.channel.error({ message: "invalid scope", close: true });
      }
    });

    return _api;
  } else if (isFunction(cstor)) {
    return await cstor(_api);
  } else {
    return _api;
  }
}
