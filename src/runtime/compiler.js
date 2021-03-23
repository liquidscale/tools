import babel from "@babel/core";
import babelPresetEnv from "@babel/preset-env";
import { defer } from "rxjs";
import { mergeMap, filter } from "rxjs/operators/index.js";

export default function (runtime) {
  runtime.events
    .pipe(
      filter(event => ["component:loaded", "component:changed"].indexOf(event.key) !== -1),
      mergeMap(event =>
        defer(async () => {
          event.component.content = await event.component.content;
          return event;
        })
      )
    )
    .subscribe(({ component, key }) => {
      if (component.type === "application/javascript") {
        try {
          component.impl = runtime.new(
            babel.transform(component.content, {
              presets: [[babelPresetEnv, { modules: "auto", targets: { node: "current" } }]],
            }).code
          );
        } catch (err) {
          console.error({ stereotype: component.stereotype, key: component.key }, err.message.red);
        }
      }
      runtime.events.next({ key: "component:compiled", from: key.split(":").slice(-1)[0], component });
    });
}
