import express from "express";
import expressWs from "express-ws";
import { filter } from "rxjs/operators/index.js";
import lodash from "lodash";

const { get } = lodash;

export default function (key, cfg, runtime) {
  console.log("configuring a websocket gateway", key, cfg);
  const port = process.env.WEBSOCKET_PORT || cfg.port || 9000;

  const app = express();
  expressWs(app);

  app.use(function (req, res, next) {
    req.context = {
      aid: req.headers["x-lqs-client-id"],
      did: req.headers["x-lqs-device-id"],
      locale: req.headers["content-language"],
      height: req.headers["x-lqs-target-height"],
      time: new Date(), //TODO: parse incoming header. target date or interval like : 7 days before, in 10 months, etc.
    };
    next();
  });

  app.ws("/", function (ws, req) {
    //TODO: handle disconnection (close all query trackers for this socket)

    ws.on("message", async function (msg) {
      const message = JSON.parse(msg);

      // extract token
      if (message.token) {
        try {
          const securityScope = await runtime.resolve({ stereotype: "scope", key: "security" });
          message.tokenInfo = securityScope.helpers.extractTokenInfos(message.token);
          delete message.token;
        } catch (err) {
          return ws.send(JSON.stringify({ error: { message: "invalid token or error processing it", code: 403 } }));
        }
      }

      if (message.query) {
        if (message.op === "open") {
          message.options = message.options || {};

          console.log("executing query in context", req.context);

          const query = {
            id: message.query,
            op: "open",
            scope: message.scope,
            selector: message.selector || "$",
            expression: message.expression,
            options: {
              single: message.options.single || false,
              offset: message.options.offset || 0,
              limit: message.options.limit || 1000,
              sort: message.options.sort,
            },
            context: {
              ...req.context,
              actor: get(message.tokenInfo, "username"),
              permissions: get(message.tokenInfo, "scope"),
            },
            channel: {
              emit(data, type = "result") {
                if (data) {
                  if (query.options.single) {
                    if (Array.isArray(data)) {
                      data = data[0];
                    }
                  }
                  console.log("ws: producing query %s result", query.id, data);
                  ws.send(JSON.stringify({ sid: query.id, type, data }));
                } else {
                  console.log("ws: skipping empty or undefined data for query %s", query.id);
                }
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
          context: { ...req.context, actor: get(message.tokenInfo, "username"), permissions: get(message.tokenInfo, "scope") },
          channel: {
            emit(data, type = "result") {
              ws.send(JSON.stringify({ sid: message.action, type, data }));
            },
            error(error) {
              console.error("action error", error);
              ws.send(JSON.stringify({ sid: message.action, type: "error", error }));
            },
            ack() {
              ws.send(JSON.stringify({ sid: message.action, type: "ack" }));
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

  console.log("starting websocket gateway on port", port);
  app.listen(port, function (err) {
    if (err) {
      return console.error(err);
    }
    console.log("gateway %s listening on port", key, port);
  });

  return {
    key,
    port,
    stereotype: "gateway",
  };
}
