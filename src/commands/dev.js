const runtimeFactory = require("../runtime");

module.exports = function () {
  return async function (args) {
    console.log("launching virtual cluster...".cyan);

    const runtime = runtimeFactory();
    await runtime.start();

    console.log("registering all local scopes");
    console.log("connecting test harness");
  };
};
