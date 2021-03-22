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

export default function () {
  return async function (args) {
    console.log("launching virtual cluster...".cyan);

    const runtime = runtimeFactory();

    console.log("deploy this as a deployment unit in our runtime. We keep watching files in order for our changes to be detected and automatically applied");
    const bundle = runtime.deploymentBundle("filesystem")(process.cwd(), { watch: true });
    console.log("deployed bundle %s to runtime %s", bundle.id, runtime.id);

    runtime.subscribe("bundle:ready", async function (event) {
      if (bundle.id === event.bundle.id) {
        await runtime.start({ monitoring: ["debug", "unit", "smoke"] });
        console.log("development cluster %s is started in watch mode. Visit http://localhost:9000 to access your development dashboard", runtime.id);
      }
    });
  };
}
