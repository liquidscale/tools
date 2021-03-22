export default function (action, runtime, component) {
  let sub = null;

  return {
    key: action.key,
    description: action.description,
    schema: runtime.wrapSchema(action.schema),
    stereotype: "action",
    async attach() {
      if (action.bind && action.bind.scope) {
        console.log("binding action %s to its target and registering any subscription", component.key, action.bind.scope);
        sub = runtime.selectComponents({ stereotype: "scope", key: action.bind.scope }, { matchDynamicKey: true }).subscribe(scope => {
          console.log("registering action %s in scope", action.key, scope);
          scope.registerAction(this);
        });
      } else {
        console.log("action bind unavailable or not supported for now", action.bind);
      }
    },
    async detach() {
      console.log("detaching action from it's bounding target(s)");
      if (sub) {
        sub.unsubscribe();
      }
    },
  };
}
