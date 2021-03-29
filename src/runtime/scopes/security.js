import oh from "object-hash";
import signinAction from "./security/signin.action.js";
import JWT from "jsonwebtoken";
import lodash from "lodash";

const { get } = lodash;
class ActionError {
  constructor(spec) {
    Object.assign(this, spec);
  }
}

export default async function (runtime) {
  const _scope = {
    key: "security",
    stereotype: "scope",
    store: await runtime.createStore("memory", "security"),
    helpers: {
      async verifyPassword(password, encrypted) {
        // TODO: use bcrypt
        return password === encrypted;
      },
      async jwtSign(sub, scope = "*") {
        return JWT.sign({ scope, username: sub.username }, _scope.config.jwt.signkey, { audience: _scope.key, issuer: _scope.config.jwt.issuer, subject: sub.username, expiresIn: "7 days" });
      },
      extractTokenInfos(token) {
        return JWT.verify(token, _scope.config.jwt.signkey, { audience: _scope.key, issuer: _scope.config.jwt.issuer });
      },
    },
    async executeInContext(action, data, fn, context, options = {}) {
      console.log("executing action in security scope");

      try {
        // TODO: check if action is supported
        // TODO: check if all permissions are satisfied

        const state = await this.store.loadState(context);
        console.log("security scope state", state);
        const draft = await state.draft();

        // execute the fn, injecting all helpers and errors
        const errors = {
          ActionError,
        };

        const result = await fn({ ...action, data }, draft, { helpers: _scope.helpers, errors });

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

  let startSubscription = null;
  let prevHash = null;

  runtime.config.changes.subscribe(async cfg => {
    const newHash = oh(cfg.security || {});
    if (prevHash !== newHash) {
      console.log("configuring security scope", cfg.security || {});

      // initializing scope state with our new config
      await _scope.store.initState(get(cfg.security, "state") || {});
      _scope.config = cfg.security;

      if (startSubscription) {
        startSubscription.unsubscribe();
      }

      const targetScope = await runtime.registry.findComponent({ stereotype: _scope.stereotype, key: _scope.key });
      console.log("found security scope", targetScope);
      if (!targetScope) {
        console.log("starting security scope");

        runtime.queries.subscribe(_scope.key, query => {
          console.log("executing query on security scope", query);
        });

        // register our associated actions
        signinAction(runtime);
        runtime.events.next({ key: "component:installed:new", component: _scope });
      } else {
        //TODO: apply new configuration to security instance
        runtime.events.next({ key: "component:installed:updated", component: _scope });
      }

      prevHash = newHash;
    }
  });
}
