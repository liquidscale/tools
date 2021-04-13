#!/usr/bin/env node --experimental-vm-modules --trace-warnings

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

import("colors");
import Promise from "bluebird";
global.Promise = Promise;
import minimist from "minimist";

const args = minimist(process.argv.slice(2), {
  string: [],
  alias: {},
  default: {},
});

console.log("LiquidScale Tools Version 1.0");
console.log();

const commandKey = args._.shift();
if (commandKey) {
  try {
    (async function () {
      const command = await import(`./commands/${commandKey}.js`);
      try {
        await command.default()(args);
      } catch (err) {
        console.error("execution error", err);
      }
    })();
  } catch (err) {
    console.error(err);
  }
} else {
  displayUsage();
  process.exit(1);
}

function displayUsage() {
  console.log("usage...");
}
