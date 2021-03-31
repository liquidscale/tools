export default function (spec, runtime) {
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

  runtime.actions.subscribe(action.key, async function (req) {
    console.log("executing action", action.key, req);

    // validate action payload
    const [payload, errors] = action.schema.normalize(req.data);
    if (errors) {
      return req.channel.error({ message: "validation error", code: 100, errors });
    }

    // bind to our target scope (if specified)
    let scope = null;
    if (spec.bind.scope) {
      scope = await runtime.resolve({ stereotype: "scope", key: spec.bind.scope });
    }

    //TODO: check if action can be applied on this scope
    //TODO: check action execution permissions

    const reducers = await resolveReducers(); // should be provided by scope

    const [result, error] = await scope.executeInContext(action, payload, reducers, req.context);

    if (result) {
      req.channel.emit(result.data || result, result.type);
    } else if (error) {
      req.channel.error(error);
    } else {
      req.channel.ack();
    }
  });

  return action;
}
