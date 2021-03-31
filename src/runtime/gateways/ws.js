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

  // TODO: add oauth middleware. check incoming token, extract user identity

  app.ws("/", function (ws) {
    ws.on("message", async function (msg, req) {
      const message = JSON.parse(msg);

      // extract token
      if (message.token) {
        try {
          const securityScope = await runtime.resolve({ stereotype: "scope", key: "security" });
          message.tokenInfo = securityScope.helpers.extractTokenInfos(message.token);
        } catch (err) {
          console.error(err);
          return ws.send(JSON.stringify({ error: { message: "invalid token or error processing it", code: 403 } }));
        }
      }

      if (message.query) {
        if (message.op === "open") {
          message.options = message.options || {};

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
              actor: get(message.tokenInfo, "username"),
              permissions: get(message.tokenInfo, "scope"),
            },
            channel: {
              emit(data, type = "result") {
                if (query.options.single) {
                  console.log("producing single result", data);
                  if (Array.isArray(data)) {
                    return ws.send(JSON.stringify({ sid: query.id, type, data: data[0] }));
                  }
                }
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
