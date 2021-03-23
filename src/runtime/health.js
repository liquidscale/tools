import { filter } from "rxjs/operators/index.js";

export default function (runtime) {
  runtime.events.pipe(filter(event => event.key.indexOf("component:installed:") === 0)).subscribe(({ key, component }) => {
    if (key.indexOf(":updated") !== -1) {
      console.log("%s %s has been changed. Let's execute all associated tests".gray, component.stereotype, component.key);
    } else {
      console.log("running initial health checks for %s %s".gray, component.stereotype, component.key);
    }
  });
  return {};
}
