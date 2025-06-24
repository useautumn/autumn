import pino from "pino";

export const initLogger = () => {
  // Create separate streams for console and HyperDX
  const streams: pino.StreamEntry[] = [
    // Pretty console output stream
    // {
    //   level: process.env.NODE_ENV === "development" ? "debug" : "info",
    //   stream: pino.transport({
    //     target: "pino-pretty",
    //     options: {
    //       colorize: true,
    //       translateTime: "UTC:yyyy-mm-dd HH:MM:ss",
    //       ignore: "pid,hostname,res,context,req,statusCode,worker",
    //       customColors: {
    //         default: "white",
    //         60: "bgRed",
    //         50: "red",
    //         40: "yellow",
    //         30: "green",
    //         20: "blue",
    //         10: "gray",
    //         message: "reset",
    //         greyMessage: "gray",
    //         time: "darkGray",
    //       },
    //     },
    //   }),
    // },
  ];

  if (process.env.NODE_ENV == "development") {
    streams.push({
      level: process.env.NODE_ENV === "development" ? "debug" : "info",
      stream: pino.transport({
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "UTC:yyyy-mm-dd HH:MM:ss",
          ignore: "pid,hostname,res,statusCode,worker,context,req",
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
      }),
    });
  }

  // if (process.env.AXIOM_TOKEN) {
  //   streams.push({
  //     level: "info",
  //     stream: pino.transport({
  //       target: "@axiomhq/pino",
  //       options: {
  //         dataset: "express",
  //         token: "xaat-32eb7e2b-8291-40c3-a5bf-c3a0b233fcf8",
  //       },
  //     }),
  //   });
  // }

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
    pino.multistream(streams),
  );

  return logger;
};
