import { filter } from "rxjs/operators/index.js";
import actionSpi from "./platform/action-spi.js";
import timerSpi from "./platform/timer-spi.js";
import sensorSpi from "./platform/sensor-spi.js";
import effectSpi from "./platform/effect-spi.js";
import guardSpi from "./platform/guard-spi.js";
import initializerSpi from "./platform/initializer-spi.js";
import finalizerSpi from "./platform/finalizer-spi.js";
import ruleSpi from "./platform/rule-spi.js";

export default function (runtime) {
  const log = runtime.logger.child({ service: "installer" });

  runtime.events.pipe(filter(event => event.key === "component:compiled")).subscribe(async ({ component, from }) => {
    let comp = null;
    try {
      log.debug("installing %s %s", component.stereotype, component.key);
      switch (component.stereotype) {
        case "action":
          comp = actionSpi(component.impl, runtime, component);
          break;
        case "timer":
          comp = timerSpi(component, runtime);
          break;
        case "sensor":
          comp = sensorSpi(component, runtime);
          break;
        case "effect":
          comp = effectSpi(component, runtime);
          break;
        case "guard":
          comp = guardSpi(component, runtime);
          break;
        case "initializer":
          comp = initializerSpi(component, runtime);
          break;
        case "finalizer":
          comp = finalizerSpi(component, runtime);
          break;
        case "rule":
          comp = ruleSpi(component, runtime);
          break;
        case "system":
          comp = await component.impl.getComponent();
          break;
        case "scope":
          comp = await component.impl.getComponent();
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
    } catch (err) {
      log.error("Unable to install component".red, { stereotype: component.stereotype, key: component.key }, err);
    }
  });
}
