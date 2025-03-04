import { initLogger } from "@/errors/logger.js";
import { Logtail } from "@logtail/node";

export const createLogtailLogger = () => {
  const pinoLogger = initLogger();
  const logtail = new Logtail(process.env.LOGTAIL_SOURCE_TOKEN!, {
    endpoint: process.env.LOGTAIL_INGESTING_HOST!,
  });

  // Create a custom logger that logs to both Logtail and console
  const logger = {
    debug: (...args: [any, ...any[]]) => {
      pinoLogger.debug(...args);
      logtail.debug(...args);
    },
    info: (...args: [any, ...any[]]) => {
      pinoLogger.info(...args);
      logtail.info(...args);
    },
    warn: (...args: [any, ...any[]]) => {
      pinoLogger.warn(...args);
      logtail.warn(...args);
    },
    error: (...args: [any, ...any[]]) => {
      pinoLogger.error(...args);
      logtail.error(...args);
    },
    use: (fn: any) => {
      logtail.use(fn);
    },
    getLogtail: () => logtail,
  };

  return logger;
};

const logtail = createLogtailLogger();
export default logtail;
