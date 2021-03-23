import { filter } from "rxjs/operators/index.js";
import { combineLatest } from "rxjs";

export default function (runtime) {
  combineLatest([
    runtime.config.changes,
    runtime.events.pipe(filter(event => ["component:registered", "component:replaced"].indexOf(event.key) !== -1 && event.component.stereotype === "system")),
  ]).subscribe(([config, { component }]) => {
    component.applyConfig(config);
    if (component.getStatus() !== "active") {
      component.start();
    } else {
      console.log("system %s was updated".yellow, component.key);
    }
  });
}
