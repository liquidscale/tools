import { filter } from "rxjs/operators/index.js";

export default function (runtime) {
  runtime.events.pipe(filter(event => event.key === "component:compiled")).subscribe(({ component, from }) => {
    let comp = null;
    switch (component.stereotype) {
      case "action":
        comp = runtime.wrapAction(component.impl, component);
        break;
      default:
        comp = component;
        break;
    }

    if (from === "loaded") {
      runtime.events.next({ key: "component:installed:new", component: comp });
    } else {
      runtime.events.next({ key: "component:installed:updated", component: comp });
    }
  });
}
