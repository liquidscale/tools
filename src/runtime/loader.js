import fs from "fs-extra";
import mime from "mime";

export default function (runtime) {
  return function ({ op, path }) {
    let comp = null;
    if (op !== "remove") {
      comp = {};
      const segments = path.match(/^(.*)\.(.*?)\.(.*?)$/);
      if (segments && segments.length === 4) {
        comp.categories = segments[1].split("/");
        comp.key = comp.categories.pop();
        comp.stereotype = segments[2];
        comp.lang = segments[3];
        comp.file = path;
      } else {
        const fragments = path.split("/");
        comp.key = fragments.pop().split(".")[0];
        comp.categories = fragments;
        comp.stereotype = "support";
        comp.file = path;
      }
      comp.type = mime.getType(path);
      comp.content = fs.readFile(runtime.path(path), "utf8");
    }

    return { op, comp, path };
  };
}
