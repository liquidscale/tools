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
import { runtimeFactory } from "../runtime/index.js";
import Yaml from "js-yaml";
import fs from "fs-extra";
import lodash from "lodash";
import Path from "path";

const { omit } = lodash;

async function loadBundleConfig(defaultConfig = {}) {
  if (fs.existsSync("package.json")) {
    const packageInfo = JSON.parse(fs.readFileSync("package.json", "utf8"));
    defaultConfig.name = packageInfo.name;
    defaultConfig.version = packageInfo.version;
    defaultConfig.description = packageInfo.description;

    if (packageInfo.main) {
      defaultConfig.bootstrap = Path.resolve(packageInfo.main);
    }
    if (packageInfo.lqs) {
      return Object.assign(defaultConfig, packageInfo.lqs);
    }
  } else if (fs.existsSync("lqs.yaml")) {
    return Object.assign(defaultConfig, Yaml.load(fs.readFileSync("lqs.yaml", "utf8")));
  } else {
    return defaultConfig;
  }
}

export default function () {
  return async function (args) {
    if (process.env.NODE_ENV !== "production") {
      console.log("launching virtual cluster in development mode...".cyan);
    }

    // Retrieve LQS bundle configuration
    const bundleConfig = await loadBundleConfig({ root: process.cwd(), name: args.name, version: args.version });
    bundleConfig.root = Path.resolve(bundleConfig.root);

    runtimeFactory(bundleConfig)
      .bundle("filesystem", omit(bundleConfig, "bootstrap", "name", "version", "description"))
      .deploy({ watch: true })
      .subscribe(
        bundle => {
          // monitor bundle activity through bundle.events
        },
        error => console.error(error.message.red),
        () => console.log("bundle is deployed".green)
      );
  };
}
