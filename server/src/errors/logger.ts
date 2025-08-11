import pino from "pino";
import { Writable } from "stream";

// Custom log formatter for Bun compatibility
const createDevLogStream = () => {
  const colors = {
    reset: "\x1b[0m",
    bright: "\x1b[1m",
    dim: "\x1b[2m",
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    magenta: "\x1b[35m",
    cyan: "\x1b[36m",
    white: "\x1b[37m",
    gray: "\x1b[90m",
    bgRed: "\x1b[41m",
  };

  const levelColors: Record<number | string, string> = {
    // Numeric levels
    10: colors.gray, // trace
    20: colors.blue, // debug
    30: colors.green, // info
    40: colors.yellow, // warn
    50: colors.red, // error
    60: colors.bgRed, // fatal
    // String levels
    TRACE: colors.gray,
    DEBUG: colors.blue,
    INFO: colors.green,
    WARN: colors.yellow,
    ERROR: colors.red,
    FATAL: colors.bgRed,
  };

  const levelNames: Record<number | string, string> = {
    // Numeric levels
    10: "TRACE",
    20: "DEBUG",
    30: "INFO",
    40: "WARN",
    50: "ERROR",
    60: "FATAL",
    // String levels (pass through)
    TRACE: "TRACE",
    DEBUG: "DEBUG",
    INFO: "INFO",
    WARN: "WARN",
    ERROR: "ERROR",
    FATAL: "FATAL",
  };

  return new Writable({
    write(chunk, encoding, callback) {
      try {
        const log = JSON.parse(chunk.toString());
        const timestamp = new Date(log.time)
          .toISOString()
          .replace("T", " ")
          .replace("Z", "");
        const level = log.level;
        const levelColor = levelColors[level] || colors.white;
        const levelName =
          levelNames[level] || (typeof level === "string" ? level : "UNKNOWN");

        // Format the message
        let message = log.msg || "";

        // Add any additional fields (excluding standard pino fields)
        const excludeFields = [
          "time",
          "level",
          "msg",
          "pid",
          "hostname",
          "res",
          "statusCode",
          "worker",
          "context",
          "req",
          "data",
        ];
        const additionalFields = Object.keys(log)
          .filter((key) => !excludeFields.includes(key))
          .reduce((acc, key) => {
            acc[key] = log[key];
            return acc;
          }, {} as any);

        if (Object.keys(additionalFields).length > 0) {
          message += " " + JSON.stringify(additionalFields, null, 2);
        }

        // Format the final log line
        const formattedLog = `${colors.gray}${timestamp}${colors.reset} ${levelColor}${colors.bright}${levelName}${colors.reset} ${message}\n`;

        process.stdout.write(formattedLog);
        callback();
      } catch (error) {
        // Fallback for malformed JSON
        process.stdout.write(chunk);
        callback();
      }
    },
  });
};

export const initLogger = () => {
  // Create separate streams for console and HyperDX
  const streams: pino.StreamEntry[] = [];

  if (process.env.NODE_ENV === "development") {
    streams.push({
      level: process.env.NODE_ENV === "development" ? "debug" : "info",
      stream: createDevLogStream(),
    });
  }

  if (process.env.AXIOM_TOKEN) {
    streams.push({
      level: "info",
      stream: pino.transport({
        target: "@axiomhq/pino",
        options: {
          dataset: "express",
          token: process.env.AXIOM_TOKEN,
        },
      }),
    });
  }

  const logger = pino.default(
    {
      level: process.env.NODE_ENV === "development" ? "debug" : "info",
      formatters: {
        level: (label: any) => {
          return {
            level: label.toUpperCase(),
          };
        },
      },
    },
    // Use multistream to send logs to multiple destinations
    pino.multistream(streams)
  );

  return logger;
};
