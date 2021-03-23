import { BehaviorSubject } from "rxjs";
import lodash from "lodash";
import { filter } from "rxjs/operators/index.js";
import Yaml from "js-yaml";

const { get, merge, identity } = lodash;

export default function config(events) {
  const cfg = new BehaviorSubject();

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

  return {
    changes: cfg.asObservable().pipe(filter(identity)),
    get(key, devaultValue) {
      return get(cfg, key) || devaultValue;
    },
  };
}
