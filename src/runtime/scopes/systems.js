import { filter } from "rxjs/operators/index.js";
import { combineLatest } from "rxjs";

export default function (runtime) {
  combineLatest([
    runtime.config.keyChanged("scopes.system"),
    runtime.events.pipe(filter(event => ["component:registered", "component:replaced"].indexOf(event.key) !== -1 && event.component.stereotype === "system")),
  ]).subscribe(async ([config, { component }]) => {
    console.log("applying config to component", config, component);
    await component.applyConfig(config);
  });
}
