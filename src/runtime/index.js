const express = require("express");

module.exports = function runtimeFactory(cfg = {}) {
  const app = express();
  require("express-ws")(app);

  app.ws("/", function (ws) {
    ws.on("message", async function (msg) {
      console.log("received message", msg);
    });
  });

  // register all system scopes
  // world (org?)
  //
  // register all test components

  // runtime api
  return {
    async start() {
      app.listen(cfg.port || 9000, function (err) {
        if (err) {
          return console.error(err.message.red);
        }
        console.log("virtual cluster started exposing websocket gateway on port %d".green, cfg.port || 9000);
      });
    },
  };
};
