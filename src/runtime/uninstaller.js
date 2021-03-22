import { filter } from "rxjs/operators/index.js";

export default function (runtime) {
  runtime.events.pipe(filter(event => event.key === "bundle:changed" && event.op === "remove")).subscribe(event => {
    console.log("uninstalling component ", event);
  });
}
