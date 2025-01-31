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

const init = async () => {
  const app = express();
  const server = http.createServer(app);
  const wss = initWs(server);

  const pgClient = new pg.Client(process.env.SUPABASE_CONNECTION_STRING || "");
  await pgClient.connect();

  const queue = initQueue();
  const workers = initWorkers(queue);

  app.use((req: any, res, next) => {
    req.pg = pgClient;
    req.queue = queue;
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

  app.use(mainRouter);
  app.use("/v1", apiRouter);

  const PORT = 8080;

  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
};

init();
