import babel from "@babel/core";
import babelPresetEnv from "@babel/preset-env";

export default function (runtime) {
  return function ({ op, comp, path }) {
    if (op !== "remove") {
      if (comp.type === "application/javascript") {
        comp.content = comp.content.then(source =>
          babel.transform(source, {
            presets: [[babelPresetEnv, { modules: "auto", targets: { node: "current" } }]],
          })
        );
      }
    }
    return { op, comp, path };
  };
}
