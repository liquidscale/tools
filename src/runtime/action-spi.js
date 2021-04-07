import lodash from "lodash";

const { isFunction } = lodash;

export default function (spec, runtime) {
  const log = runtime.logger.child({ internal: true, module: "action-spi", key: spec.key });

  const action = {
    key: spec.key,
    description: spec.description,
    schema: runtime.wrapSchema(spec.schema),
    stereotype: "action",
  };

  //TODO: handle business rules and timer registration.

  async function resolveReducers() {
    //TODO: load any available registered component outside the one provided by this action
    // we need to sort them by priority, each one will receive the resulting state.
    // they must all be executed within the same commit/rollback transaction
    return spec.reducers;
  }

  async function evaluatePermissions(actionReq, payload, scope) {
    if (spec.permissions && spec.permissions.length > 0) {
      const state = await scope.getState(actionReq.context);
      return spec.permissions.reduce(
        (result, rule) => {
          console.log("checking permission rule", rule);
          if (isFunction(rule.if) && result[0]) {
            console.log("executing", rule.if.toString(), state, { data: payload, ...actionReq.context });
            const valid = rule.if.call(null, { state: state.data, data: payload, ...actionReq.context });
            if (rule.deny) {
              return [!valid, valid ? { error: { message: rule.hint || "not-enough-permissions" } } : null];
            } else {
              return [valid, valid ? null : { error: { message: rule.hint || "not-enough-permissions" } }];
            }
          } else {
            return result;
          }
        },
        [true, null]
      );
    } else {
      return [true, null];
    }
  }

  runtime.actions.subscribe(action.key, async function (req) {
    log.debug("executing action", req);

    // validate action payload
    const [payload, errors] = await action.schema.normalize(req.data);
    if (errors) {
      return req.channel.error({ message: "validation error", code: 100, errors });
    }

    log.trace("received normalized payload", payload);

    // bind to our target scope (if specified)
    let scope = null;
    if (spec.bind.scope) {
      const scopeKey = runtime.realizeKey(spec.bind.scope, req.data);
      scope = await runtime.resolve({ stereotype: "scope", key: scopeKey });
    }

    if (scope) {
      log.trace("resolved target scope", scope);

      // check if action can be applied on this scope
      if (await scope.isSupported(action.key, req)) {
        // check action execution permissions
        const [allowed, error] = await evaluatePermissions(req, payload, scope);
        if (allowed) {
          const reducers = await resolveReducers();
          log.trace("applying all reducers", reducers);
          const [result, error] = await scope.executeInContext(action, payload, reducers, req.context);

          if (result) {
            log.trace("received action result", result);
            req.channel.emit(result.data || result, result.type);
          } else if (error) {
            log.error(error);
            req.channel.error(error);
          } else {
            req.channel.ack();
          }
        } else {
          log.error(error);
          req.channel.error(error);
        }
      } else {
        log.error("unsupported action", action.key, scope.key);
        req.channel.error({ message: "unsupported-action" });
      }
    } else {
      req.channel.error({ message: "invalid-scope" });
    }
  });

  return action;
}
