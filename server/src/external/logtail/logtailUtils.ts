import { initLogger } from "@/errors/logger.js";
import { Logtail } from "@logtail/node";

const pinoLogger = initLogger();

const createLogMethod = (pinoMethod: any, logtailMethod: any) => {
  return (...args: any[]) => {
    let message = "";
    let mergedObj = {};

    // Separate strings from objects
    const strings = args.filter((arg) => typeof arg === "string");
    const objects = args.filter(
      (arg) => typeof arg === "object" && arg !== null,
    );

    // Use last string as message, or default
    if (strings.length > 0) {
      message = strings[strings.length - 1];
    }

    // Merge all objects
    mergedObj = Object.assign({}, ...objects);

    // Pino format: object first, message second (if object exists)
    if (Object.keys(mergedObj).length > 0) {
      pinoMethod(mergedObj, message);
    } else {
      pinoMethod(message);
    }

    // Logtail format: message first, then object (if exists)
    if (Object.keys(mergedObj).length > 0) {
      logtailMethod(message, mergedObj);
    } else {
      logtailMethod(message);
    }
  };
};

export const createLogtail = () => {
  const logtail = new Logtail(process.env.LOGTAIL_SOURCE_TOKEN!, {
    endpoint: process.env.LOGTAIL_INGESTING_HOST!,
  });

  // Create a custom logger that logs to both Logtail and console
  const logger = {
    debug: createLogMethod(
      pinoLogger.debug.bind(pinoLogger),
      logtail.debug.bind(logtail),
    ),
    info: createLogMethod(
      pinoLogger.info.bind(pinoLogger),
      logtail.info.bind(logtail),
    ),
    warn: createLogMethod(
      pinoLogger.warn.bind(pinoLogger),
      logtail.warn.bind(logtail),
    ),
    error: createLogMethod(
      pinoLogger.error.bind(pinoLogger),
      logtail.error.bind(logtail),
    ),
    use: (fn: any) => {
      logtail.use(fn);
    },
    getLogtail: () => logtail,
    flush: () => logtail.flush(),
  };

  return logger;
};

export const createLogtailWithContext = (context: any) => {
  const logtail = createLogtail();
  logtail.use((log: any) => {
    return {
      ...log,
      ...context,
    };
  });

  return logtail;
};

export const createLogtailAll = () => {
  const logtail = new Logtail(process.env.LOGTAIL_ALL_SOURCE_TOKEN!, {
    endpoint: process.env.LOGTAIL_ALL_INGESTING_HOST!,
  });

  return logtail;
};

// const logtail = createLogtailLogger();
// export default logtail;
