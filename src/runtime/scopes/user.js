import { filter } from "rxjs/operators/index.js";

export default async function (runtime) {
  function userInit(state, { context }) {
    state.username = context.actor;
  }

  runtime.config.keyChanged("scopes.user").subscribe(async cfg => {
    let eventKey = "component:installed:";
    let userScope = await runtime.registry.findComponent({ stereotype: "scope", key: "user" });
    if (!userScope) {
      console.log("installing user scope");
      eventKey += "new";
      userScope = await runtime.wrapScope({ key: "user/${actor}", initializers: [userInit] }, {}, async scope => {
        console.log("initializing scope".cyan, scope.key);
        scope.store = runtime.createStore("memory", scope.key);

        // Run all initializers to build initial state
        if (scope.initializers.length > 0) {
          const state = await scope.store.loadState();
          console.log("initializing state for scope %s", scope.key, state, scope.initializers);
          const draft = state.draft();
          try {
            const context = { scope: scope.getPlatformApi(), console, ...runtime.platform, context: scope.context, config: scope.config, schema: scope.schema };
            await Promise.all(scope.initializers.map(async initializer => initializer(draft, context)));
            state.commit(draft);
            console.log("committed draft");
          } catch (err) {
            console.log("unable to initialize system %s".red, scope.key, err);
            state.rollback(draft);
          }
        }

        console.log("scope %s successfully loaded".green, scope.key);
        return scope;
      });

      // Route queries and actions to the right scope
      runtime.queries.subscribe("user", function (query) {
        const targetScopeKey = runtime.realizeKey(userScope.key, query.context);
        query.scope = targetScopeKey;
        console.log("routing query to scope %s", targetScopeKey);
        runtime.queries.execute(query);
      });

      runtime.actions.$.pipe(filter(action => action.bind && action.bind.scope === "user")).subscribe(action => {
        const targetScopeKey = runtime.realizeKey(userScope.key, action.data);
        action.bind.scope = targetScopeKey;
        console.log("routing action to user scope", targetScopeKey, action);
        runtime.actions.execute(action);
      });
    } else {
      console.log("updating user scope");
      eventKey += "updated";
      await userScope.applyConfig(cfg);
    }
    runtime.events.next({ key: eventKey, component: userScope });
  });
}
