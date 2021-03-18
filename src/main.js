#!/usr/bin/env node
require("colors");
global.Promise = require("bluebird");

const args = require("minimist")(process.argv.slice(2), {
  string: [],
  alias: {},
  default: {},
});

console.log("LiquidScale Tools Version 1.0");
console.log();

const commandKey = args._.shift();
if (commandKey) {
  try {
    const command = require(`./commands/${commandKey}`)();
    (async function () {
      try {
        await command(args);
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

function displayUsage() {}
