import express from "express";
import expressWs from "express-ws";
import { filter } from "rxjs/operators/index.js";

export default function (key, cfg, runtime) {
  console.log("configuring a websocket gateway", key, cfg);
  const port = process.env.WEBSOCKET_PORT || cfg.port || 9000;

  const app = express();
  expressWs(app);

  // TODO: add oauth middleware. check incoming token, extract user identity

  app.ws("/", function (ws) {
    ws.on("message", async function (msg, req) {
      const message = JSON.parse(msg);
      if (message.query) {
        if (message.op === "open") {
          const query = {
            id: message.query,
            op: "open",
            scope: message.scope,
            expression: message.expression,
            options: message.options,
            context: {
              actor: null,
            },
            channel: {
              emit(type, data) {
                ws.send(JSON.stringify({ sid: query.id, type, data }));
              },
              error(error) {
                ws.send(JSON.stringify({ sid: query.id, type: "error", error }));
              },
            },
          };

          // push into actions subject
          runtime.queries.execute(query);
        } else if (message.op === "close") {
          runtime.queries.execute({ id: message.query, op: "close", context: { actor: null } });
        }
      } else if (message.action) {
        const action = {
          ...message,
          context: {},
          channel: {
            emit(data, type = "result") {
              ws.send(JSON.stringify({ sid: message.action, type, data }));
            },
            error(error) {
              console.error("action error", error);
              ws.send(JSON.stringify({ sid: message.action, type: "error", error }));
            },
          },
        };

        // push into actions subject
        runtime.actions.execute(action);
      } else {
        console.error("unsupported message type", message);
        ws.send(JSON.stringify({ error: "unsupported-message-type" }));
      }
    });
  });

  runtime.events.pipe(filter(event => event.key === "runtime:start")).subscribe(() => {
    console.log("starting websocket gateway on port", port);
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
