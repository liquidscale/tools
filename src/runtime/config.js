import { BehaviorSubject } from "rxjs";
import lodash from "lodash";
import { filter, map } from "rxjs/operators/index.js";
import Yaml from "js-yaml";
import oh from "object-hash";
import { createHash } from "crypto";

const { get, merge, identity } = lodash;

export default function config(events) {
  const cfg = new BehaviorSubject({
    scopes: {
      cluster: {},
      library: {},
      world: {},
      organization: {},
      device: {},
      user: {},
      security: {
        store: {
          initialState: {
            users: [],
          },
        },
      },
      system: {},
    },
  });

  events.pipe(filter(event => event.key.indexOf("component:installed") === 0 && event.component.stereotype === "config")).subscribe(event => {
    // apply content any modified config
    if (event.component.type === "text/yaml") {
      const content = Yaml.load(event.component.content);
      cfg.next(merge(cfg.getValue(), content));
    } else if (event.component.type === "application/json") {
      const content = JSON.parse(event.component.content);
      cfg.next(merge(cfg.getValue(), content));
    } else {
      console.log("skipping unrecognized support file", event.component.file);
    }
  });

  const watchedKeys = {};

  return {
    keyChanged(key) {
      return cfg.asObservable().pipe(
        map(config => {
          const target = get(config, key);
          if (target) {
            const hashKey = createHash("md5").update(key).digest("hex");
            const newHash = oh(target);
            const prevHash = watchedKeys[hashKey];
            if (newHash !== prevHash) {
              watchedKeys[hashKey] = newHash;
              return target;
            }
          }
        }),
        filter(identity)
      );
    },
    changes: cfg.asObservable().pipe(filter(identity)),
    get(key, devaultValue) {
      return get(cfg, key) || devaultValue;
    },
  };
}
