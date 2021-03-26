export default function (action, runtime, component) {
  let sub = null;

  const comp = {
    key: action.key,
    description: action.description,
    schema: runtime.wrapSchema(action.schema),
    stereotype: "action",
  };

  //TODO: handle business rules and timer registration.

  runtime.actions.subscribe(comp.key, function (req) {
    console.log("executing action", req);

    // validate action payload
    // bind to our target scope (if specified)
    //
  });

  return comp;
}
