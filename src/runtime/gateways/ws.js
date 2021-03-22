import express from "express";
import expressWs from "express-ws";
import { filter } from "rxjs/operators/index.js";

export default function (key, cfg, runtime) {
  console.log("configuring a websocket gateway", key, cfg);
  const port = process.env.WEBSOCKET_PORT || cfg.port || 9000;

  const app = express();
  expressWs(app);

  app.ws("/", function (ws) {
    ws.on("message", async function (msg, req) {
      // parse incoming message
      const action = JSON.parse(msg);

      // build the action context from http headers and params
      action.context = {};

      // push into actions subject
      runtime.actions.next(action);
    });
  });

  runtime.events.pipe(filter(event => event.key === "runtime:start")).subscribe(() => {
    app.listen(port, function (err) {
      if (err) {
        return console.error(err);
      }
      console.log("gateway %s listening on port", key, port);
    });
  });

  return {
    key,
    port,
    stereotype: "gateway",
  };
}
