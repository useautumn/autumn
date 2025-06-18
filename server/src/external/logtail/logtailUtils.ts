import dotenv from "dotenv";
dotenv.config();

import { initLogger } from "@/errors/logger.js";
import { Logtail } from "@logtail/node";

const pinoLogger = initLogger();

const createLogMethod = (pinoMethod: any, logtailMethod: any) => {
  function rewriteAppPath(str: string) {
    if (typeof str !== "string") return str;
    // Replace file:///app/ with ./
    str = str.replace("file:///app/", "./");
    return str.replace(/\/app\//g, "./");
  }

  function rewriteErrorStack(error: Error) {
    if (error instanceof Error && typeof error.stack === "string") {
      const newError = new Error(error.message);
      newError.stack = rewriteAppPath(error.stack);
      return newError;
    }

    return error;
  }

  return (...args: any[]) => {
    let message = "";
    let mergedObj = {};

    // Helper function to convert Error objects to plain objects

    const strings = args
      .filter((arg) => typeof arg === "string")
      .map(rewriteAppPath);
    const objects = args
      .filter((arg) => typeof arg !== "string" && arg !== null)
      .map((obj) => (obj instanceof Error ? rewriteErrorStack(obj) : obj));

    // Use last string as message, or use Error message if no strings provided
    if (strings.length > 0) {
      message = strings[strings.length - 1];
    } else {
      // If no string message but we have an Error object, use its stack trace
      const errorObject = args.find((arg) => arg instanceof Error);
      if (errorObject) {
        message = rewriteAppPath(
          errorObject.stack || errorObject.message || "Error occurred",
        );
      }
    }

    // Merge all objects
    mergedObj = Object.assign({}, ...objects);

    // Pino format: object first, message second (if object exists)
    if (Object.keys(mergedObj).length > 0) {
      pinoMethod(mergedObj, message);
    } else {
      pinoMethod(message);
    }

    if (!logtailMethod) {
      return;
    }

    // Logtail format: message first, then object (if exists)
    if (Object.keys(mergedObj).length > 0) {
      logtailMethod(message, mergedObj);
    } else {
      logtailMethod(message);
    }
  };
};

export const createLogger = ({
  sourceToken,
  ingestingHost,
}: {
  sourceToken: string;
  ingestingHost: string;
}) => {
  let logtail: any;
  if (sourceToken && ingestingHost) {
    logtail = new Logtail(sourceToken, {
      endpoint: ingestingHost,
    });
  }

  // Create a custom logger that logs to both Logtail and console
  const logger = {
    debug: createLogMethod(
      pinoLogger.debug.bind(pinoLogger),
      logtail?.debug.bind(logtail),
    ),
    info: createLogMethod(
      pinoLogger.info.bind(pinoLogger),
      logtail?.info.bind(logtail),
    ),
    warn: createLogMethod(
      pinoLogger.warn.bind(pinoLogger),
      logtail?.warn.bind(logtail),
    ),
    error: createLogMethod(
      pinoLogger.error.bind(pinoLogger),
      logtail?.error.bind(logtail),
    ),
    use: (fn: any) => {
      logtail?.use(fn);
    },
    flush: () => logtail?.flush(),
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

export const createLogtail = () => {
  return createLogger({
    sourceToken: process.env.LOGTAIL_SOURCE_TOKEN!,
    ingestingHost: process.env.LOGTAIL_INGESTING_HOST!,
  });
};

export const createLogtailAll = () => {
  if (
    !process.env.LOGTAIL_ALL_SOURCE_TOKEN ||
    !process.env.LOGTAIL_ALL_INGESTING_HOST
  ) {
    return null;
  }

  const logtail = new Logtail(process.env.LOGTAIL_ALL_SOURCE_TOKEN!, {
    endpoint: process.env.LOGTAIL_ALL_INGESTING_HOST!,
  });

  return logtail;
};

export const logger = createLogtail();
export const logtailAll = createLogtailAll();
