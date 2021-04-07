import express from "express";
import expressWs from "express-ws";
import lodash from "lodash";

const { get } = lodash;

export default function (key, cfg, runtime) {
  const log = runtime.logger.child({ module: "gateway", key, level: cfg.logLevel });
  log.debug("configuring a websocket gateway", key, cfg);
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

          const query = {
            id: message.query,
            op: message.op,
            scope: message.scope,
            selector: message.selector || "$",
            expression: message.expression,
            target: message.target || "default",
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
                  try {
                    ws.send(JSON.stringify({ sid: query.id, type, data }));
                  } catch (err) {
                    log.debug("error sending result. let's assume the socket is closed for now", err.message);
                    runtime.queries.execute({ id: message.query, op: "close", context: { actor: null } });
                  }
                }
              },
              error(error) {
                try {
                  ws.send(JSON.stringify({ sid: query.id, type: "error", error }));
                  if (error.close) {
                    runtime.queries.execute({ id: query.id, op: "close", context: { actor: null } });
                  }
                } catch (err) {
                  log.error("query-error", err);
                }
              },
            },
          };

          // push into actions subject
          runtime.queries.execute(query);
        } else if (message.op === "close") {
          runtime.queries.execute({ id: message.query, op: message.op, context: { actor: null } });
        }
      } else if (message.action) {
        const action = {
          ...message,
          context: { ...req.context, actor: get(message.tokenInfo, "username"), permissions: get(message.tokenInfo, "scope") },
          channel: {
            emit(data, type = "result") {
              try {
                ws.send(JSON.stringify({ sid: message.action, type, data }));
              } catch (err) {
                log.error("action-emit", err);
              }
            },
            error(error) {
              log.error("action error", error);
              try {
                ws.send(JSON.stringify({ sid: message.action, type: "error", error }));
              } catch (err) {
                log.error("action-error", err);
              }
            },
            ack() {
              try {
                ws.send(JSON.stringify({ sid: message.action, type: "ack" }));
              } catch (err) {
                log.error("action-ack", err);
              }
            },
          },
        };

        // push into actions subject
        runtime.actions.execute(action);
      } else {
        log.error("unsupported message type", message);
        ws.send(JSON.stringify({ error: "unsupported-message-type" }));
      }
    });
  });

  log.debug("starting websocket gateway on port", port);
  app.listen(port, function (err) {
    if (err) {
      return log.error(err);
    }
    log.info("gateway %s listening on port", key, port);
  });

  return {
    key,
    port,
    stereotype: "gateway",
  };
}
