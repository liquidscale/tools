import { BehaviorSubject } from "rxjs";
import shortid from "shortid-36";
import Path from "path";
import chokidar from "chokidar";
import fs from "fs-extra";

export function fileSystemBundle(runtime, { root, name, version, description } = {}) {
  const log = runtime.logger.child({ service: "bundle", type: "fs", bundle: name, version });
  const id = shortid.generate();
  log.debug("loading bundle", id);

  const bundle = new BehaviorSubject({
    id,
    name: name || Path.basename(root),
    version: version || "1.0.0",
    description,
    type: "fs",
    root: Path.resolve(root),
  });

  return {
    deploy({ watch = true } = {}) {
      runtime.whenReady(function () {
        log.debug("deploying bundle %s", id, root + "/**/*.*");

        // list the content of this path
        const watcher = chokidar.watch("**/*.*", {
          ignored: /(^|[\/\\])\../, // ignore dotfiles
          persistent: true,
          cwd: root,
        });

        watcher
          .on("add", path => runtime.events.next({ key: "bundle:changed", op: "add", bundle, entries: [{ path, content: fs.readFile(Path.join(bundle.getValue().root, path), "utf8") }] }))
          .on("change", path => runtime.events.next({ key: "bundle:changed", op: "change", bundle, entries: [{ path, content: fs.readFile(Path.join(bundle.getValue().root, path), "utf8") }] }))
          .on("unlink", path => runtime.events.next({ key: "bundle:changed", op: "remove", bundle, entries: [{ path }] }))
          .on("error", error => bundle.error(error))
          .on("ready", () => {
            if (!watch) {
              log.info("all components are loaded. we don't want anything.");
              watcher.close();
              bundle.complete();
            }
          });
      });

      return bundle;
    },
  };
}
