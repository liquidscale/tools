import { filter } from "rxjs/operators/index.js";
import Yaml from "js-yaml";

export default function (runtime) {
  runtime.events.pipe(filter(event => event.key.indexOf("component:installed:") === 0)).subscribe(async ({ key, component }) => {
    // Handle test data injection
    if (component.stereotype === "dataset" && component.lang === "yaml") {
      const dataset = Yaml.load(component.content);
      const targetScope = await runtime.resolve({ stereotype: "scope", key: dataset.scope });
      if (dataset.type === "snapshot") {
        console.log("injecting test dataset %s in scope %s at height %d", component.key, dataset.scope, dataset.height);
        await targetScope.store.injectSnapshot({ height: dataset.height, data: dataset.data, ts: dataset.ts });
      }
    } else {
      if (key.indexOf(":updated") !== -1) {
        console.log("%s %s has been changed. Let's execute all associated tests".gray.dim, component.stereotype, component.key);
      } else {
        console.log("running initial health checks for %s %s".gray.dim, component.stereotype, component.key);
      }
    }
  });

  return {};
}
