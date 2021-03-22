import { Observable } from "rxjs";
import shortid from "shortid-36";
import Path from "path";
import chokidar from "chokidar";
import fs from "fs-extra";

export function fileSystemBundle(runtime) {
  return function (root, { name, version, watch = true } = {}) {
    const id = shortid.generate();
    const bundle = {
      id,
      name: name || id,
      version: version || "1.0.0",
      type: "fs",
      root: Path.resolve(root),
    };

    // list the content of this path
    const watcher = chokidar.watch("**/*.*", {
      ignored: /(^|[\/\\])\../, // ignore dotfiles
      persistent: true,
      cwd: root,
    });
    watcher
      .on("add", path => runtime.events.next({ key: "bundle:changed", op: "add", bundle, entries: [{ path, content: fs.readFile(Path.join(bundle.root, path), "utf8") }] }))
      .on("change", path => runtime.events.next({ key: "bundle:changed", op: "change", bundle, entries: [{ path, content: fs.readFile(Path.join(bundle.root, path), "utf8") }] }))
      .on("unlink", path => runtime.events.next({ key: "bundle:changed", op: "remove", bundle, entries: [{ path }] }))
      .on("error", error => obs.error(error))
      .on("ready", () => {
        if (!watch) {
          console.log("all components are loaded. we don't want anything.");
          watcher.close();
          obs.complete();
        }
      });

    return bundle;
  };
}
