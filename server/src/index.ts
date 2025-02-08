import { config } from "dotenv";
config();

import mainRouter from "./internal/mainRouter.js";
import express from "express";
import cors from "cors";
import chalk from "chalk";
import { apiRouter } from "./internal/api/apiRouter.js";
import webhooksRouter from "./external/webhooks/webhooksRouter.js";
import { envMiddleware } from "./middleware/envMiddleware.js";
import pg from "pg";

import { initQueue, initWorkers } from "./queue/queue.js";
import http from "http";
import { initWs } from "./websockets/initWs.js";
import { publicRouter } from "./internal/public/publicRouter.js";
import { initLogger } from "./errors/logger.js";
import RecaseError, { handleRequestError } from "./utils/errorUtils.js";

const init = async () => {
  const app = express();
  const server = http.createServer(app);
  const wss = initWs(server);
  const logger = initLogger();

  const pgClient = new pg.Client(process.env.SUPABASE_CONNECTION_STRING || "");
  await pgClient.connect();

  const queue = initQueue();
  const workers = initWorkers(queue);

  app.use((req: any, res, next) => {
    req.pg = pgClient;
    req.queue = queue;
    req.logger = logger;
    next();
  });

  app.use(cors());
  app.use(envMiddleware);
  app.use("/webhooks", webhooksRouter);

  app.use((req: any, res, next) => {
    const method = req.method;
    const path = req.url;
    const methodToColor: any = {
      GET: chalk.green,
      POST: chalk.yellow,
      PUT: chalk.blue,
      DELETE: chalk.red,
      PATCH: chalk.magenta,
    };

    const methodColor: any = methodToColor[method] || chalk.gray;

    console.log(
      `${chalk.gray(new Date().toISOString())} ${methodColor(
        method
      )} ${chalk.white(path)}`
    );

    next();
  });

  app.use(express.json());

  // JSON error handler
  app.use((err: any, req: any, res: any, next: any) => {
    // you can error out to stderr still, or not; your choice
    // console.error(err);
    console.log(`JSON error handler: ${err.message}`);

    // body-parser will set this to 400 if the json is in error
    if (err.status === 400)
      return res.status(err.status).json({
        message: "Invalid JSON payload",
        code: "INVALID_JSON",
      });

    return next(err); // if it's not a 400, let the default error handling do it.
  });

  app.use(mainRouter);
  app.use("/public", publicRouter);
  app.use("/v1", apiRouter);

  const PORT = 8080;

  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
};

init();
