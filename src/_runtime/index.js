/*
    MIT License

    Copyright (c) 2021 Covistra Technologies Inc.

    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in all
    copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
    SOFTWARE.
*/
import express from "express";
import expressWs from "express-ws";
import Path from "path";
import shortid from "shortid-36";
import chokidar from "chokidar";
import { Observable, Subject } from "rxjs";
import { map, filter } from "rxjs/operators/index.js";
import loader from "./loader.js";
import compiler from "./compiler.js";
import installer from "./installer.js";
import uninstaller from "./uninstaller.js";
import worldScopeFactory from "./scopes/world.js";
import registryFactory from "./registry.js";
import vm from "vm";
import sandbox from "./sandbox.js";
import configSpi from "./config-spi.js";
import schemaSpi from "./schema-spi.js";
import scopeSpi from "./scope-spi.js";
import actionSpi from "./action-spi.js";

export function runtimeFactory(cfg = {}) {
  const app = express();
  expressWs(app);

  const id = shortid.generate();

  // contains all available components (loaded from local files)
  const registry = registryFactory(cfg.registry);

  // represent the virtual cluster state.
  const cluster = {
    processes: [],
    events: new Subject(),
    async start(proc, started = false) {
      proc.id = proc.id || shortid.generate();
      if (!started) {
        await proc.start();
      }
      this.processes.push(proc);
      this.events.next({ type: "lifecycle", status: "running", pid: proc.id });
    },
  };

  // any incoming actions from ingresses (websocket and http for now)
  const actions = new Subject();
  const internals = {};
  app.ws("/", function (ws) {
    ws.on("message", async function (msg, req) {
      // parse incoming message
      const action = JSON.parse(msg);

      // build the action context from http headers and params
      action.context = {};

      // push into actions subject
      actions.push(action);
    });
  });

  // register all lqs scopes
  const world = worldScopeFactory(cfg.world, internals);
  cluster.start(world);

  // runtime api
  return {
    id,
    port: cfg.port || 9000,
    async start({ monitoring } = {}) {
      // let's deploy any monitoring bundles
      if (monitoring) {
        console.log("deploying monitoring bundles", monitoring);
      }

      app.listen(cfg.port || 9000, function (err) {
        if (err) {
          return console.error(err.message.red);
        }
        console.log("virtual cluster started exposing websocket gateway on port %d".green, cfg.port || 9000);
      });
    },
    async deploy(root, { watch } = {}) {
      // runtime spi
      const spi = {
        id,
        path(sub) {
          return Path.resolve(root, sub);
        },
        new(code) {
          const script = new vm.Script(code);
          try {
            const context = vm.createContext(sandbox(this));
            script.runInContext(context);
            if (context.exports.default) {
              return context.exports.default;
            } else {
              return context.exports;
            }
          } catch (err) {
            console.error("runtime error", err);
          }
        },
        register(comp) {
          registry.register(comp);
        },
        wrapScope(scope) {
          return scopeSpi(scope, this);
        },
        wrapConfig(cfg) {
          return configSpi(cfg, this);
        },
        wrapSchema(spec) {
          return schemaSpi(spec, this);
        },
        wrapAction(action, comp) {
          return actionSpi(action, this, comp);
        },
        selectComponent(...args) {
          return registry.selectComponent(...args);
        },
        selectComponents(...args) {
          return registry.selectComponents(...args);
        },
        actions_() {
          return actions;
        },
        getCluster() {
          return cluster;
        },
      };

      const files = new Observable(function observer(obs) {
        // list the content of this path
        const watcher = chokidar.watch("**/*.*", {
          ignored: /(^|[\/\\])\../, // ignore dotfiles
          persistent: true,
          cwd: root,
        });
        watcher
          .on("add", path => obs.next({ op: "add", path }))
          .on("change", path => obs.next({ op: "change", path }))
          .on("unlink", path => obs.next({ op: "remove", path }))
          .on("error", error => obs.error(error))
          .on("ready", () => {
            if (!watch) {
              console.log("all components are loaded. we don't want anything.");
              watcher.close();
              obs.complete();
            }

            console.log("starting all runnable scopes");
            registry.components.subscribe(async comp => {
              const instance = await comp.instance;
              if (instance.runnable) {
                try {
                  console.log("starting scope", comp.key);
                  await instance.start();
                } catch (err) {
                  console.error(err);
                }
              }
            });
            console.log("bind all actions to their scopes");
            registry.components.pipe(filter(c => c.stereotype === "action")).subscribe(async comp => (await comp.instance).attach());
          });
      });

      const components = files.pipe(map(loader(spi)), map(compiler(spi)), map(installer(spi)), map(uninstaller(spi))).subscribe();

      return {
        id: shortid.generate(),
        files,
        components,
      };
    },
  };
}
