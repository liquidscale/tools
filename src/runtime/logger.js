import { createLogger } from "bunyan";
import bformat from "bunyan-format";

//const formatOut = bformat({ outputMode: "short" });
export const logger = createLogger({ name: "lqs", level: "debug" });

global.console = {
  log: logger.debug.bind(logger),
  error: logger.error.bind(logger),
  warn: logger.warn.bind(logger),
  info: logger.info.bind(logger),
  debug: logger.debug.bind(logger),
  trace: logger.trace.bind(logger),
};

import("colors");
