import pino from "pino";

export const initLogger = () => {
  const logger = pino.default({
    transport: {
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "UTC:yyyy-mm-dd HH:MM:ss",
        ignore: "pid,hostname",
        customColors: {
          default: "white",
          60: "bgRed",
          50: "red",
          40: "yellow",
          30: "green",
          20: "blue",
          10: "gray",
          message: "reset",
          greyMessage: "gray",
          time: "darkGray",
        },
      },
    },
    level: process.env.NODE_ENV === "development" ? "debug" : "info",
    formatters: {
      level: (label) => {
        return {
          level: label.toUpperCase(),
        };
      },
    },
  });

  // logger.info("Logger initialized");

  return logger;
};
