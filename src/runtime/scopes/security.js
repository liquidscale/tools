import signinAction from "./security/signin.action.js";
import JWT from "jsonwebtoken";

export default async function (runtime) {
  runtime.config.keyChanged("scopes.security").subscribe(async cfg => {
    console.log("configuring security scope", cfg || {});

    const helpers = {
      async verifyPassword(password, encrypted) {
        // TODO: use bcrypt
        return password === encrypted;
      },
      async jwtSign(sub, scope = "*") {
        return JWT.sign({ scope, username: sub.username }, cfg.jwt.signkey, {
          audience: cfg.jwt.audience || "security",
          issuer: cfg.jwt.issuer,
          subject: sub.username,
          expiresIn: cfg.jwt.duration || "7 days",
        });
      },
      extractTokenInfos(token) {
        return JWT.verify(token, cfg.jwt.signkey, { audience: cfg.jwt.audience || "security", issuer: cfg.jwt.issuer });
      },
    };

    let eventKey = "component:installed:";
    let securityScope = await runtime.registry.findComponent({ stereotype: "scope", key: "security" });
    if (!securityScope) {
      console.log("installing security scope");
      eventKey += "new";
      securityScope = await runtime.wrapScope({
        key: "security",
        store: runtime.createStore("memory", "security", cfg.store),
        helpers,
      });
      await securityScope.applyConfig(cfg);

      runtime.queries.subscribe(securityScope.key, query => {
        console.log("executing query on security scope", query);
      });

      // register our associated actions
      signinAction(runtime);
    } else {
      console.log("updating security scope");
      eventKey += "updated";
      await securityScope.applyConfig(cfg);
    }
    runtime.events.next({ key: eventKey, component: securityScope });
  });
}
