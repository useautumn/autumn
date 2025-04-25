import { config } from "dotenv";
config();

import mainRouter from "./internal/mainRouter.js";
import express from "express";
import cors from "cors";
import chalk from "chalk";
import { apiRouter } from "./internal/api/apiRouter.js";
import webhooksRouter from "./external/webhooks/webhooksRouter.js";

import pg from "pg";

import http from "http";
import { publicRouter } from "./internal/public/publicRouter.js";
import { initLogger } from "./errors/logger.js";
import { QueueManager } from "./queue/QueueManager.js";
import { AppEnv } from "@autumn/shared";
import { createSupabaseClient } from "./external/supabaseUtils.js";
import {
  createLogtail,
  createLogtailAll,
} from "./external/logtail/logtailUtils.js";
import { format } from "date-fns";

const init = async () => {
  const app = express();

  const logger = initLogger();
  const server = http.createServer(app);
  server.keepAliveTimeout = 120000; // 120 seconds
  server.headersTimeout = 120000; // 120 seconds should be >= keepAliveTimeout

  const pgClient = new pg.Client(process.env.SUPABASE_CONNECTION_STRING || "");
  await pgClient.connect();

  await QueueManager.getInstance(); // initialize the queue manager
  // await initWorkers();
  const supabaseClient = createSupabaseClient();
  const logtailAll = createLogtailAll();

  app.use((req: any, res, next) => {
    req.sb = supabaseClient;
    req.pg = pgClient;
    req.logger = logger;
    req.logtailAll = logtailAll;

    // Log incoming request

    try {
      let headersClone = structuredClone(req.headers);
      headersClone.authorization = undefined;
      headersClone.Authorization = undefined;

      logtailAll.info(`${req.method} ${req.originalUrl}`, {
        url: req.originalUrl,
        method: req.method,
        headers: headersClone,
        body: req.body,
      });

      req.logtail = createLogtail();
    } catch (error) {
      req.logtail = logtailAll; // fallback
      console.error(`Error creating req.logtail`);
      console.error(error);
    }

    res.on("finish", () => {
      req.logtail.flush();
    });

    next();
  });

  app.use(cors());

  app.use((req: any, res: any, next: any) => {
    req.env = req.env = req.headers["app_env"] || AppEnv.Sandbox;
    next();
  });
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
      `${chalk.gray(format(new Date(), "dd MMM HH:mm:ss"))} ${methodColor(
        method
      )} ${chalk.white(path)}`
    );

    next();
  });

  app.use(express.json());
  app.use(mainRouter);
  app.use("/public", publicRouter);
  app.use("/v1", apiRouter);

  const PORT = 8080;

  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
};

import cluster from "cluster";
import os from "os";
let numCPUs = os.cpus().length;

if (cluster.isPrimary) {
  console.log(`Master ${process.pid} is running`);
  console.log("Number of CPUs", numCPUs);
  let numWorkers = Math.min(numCPUs, 3);

  for (let i = 0; i < numWorkers; i++) {
    cluster.fork();
  }

  cluster.on("exit", (worker, code, signal) => {
    console.log(`Worker ${worker.process.pid} died`);
    cluster.fork();
  });
} else {
  init();
}

// console.log("Number of CPUs", numCPUs);
// init();

// process.on("unhandledRejection", (reason, promise) => {
//   try {
//     const logtail = createLogtail();
//     logtail.error("❗️❗️❗️ UNHANDLED REJECTION");
//     logtail.error(reason);
//     logtail.flush();
//   } catch (error) {
//     console.log("Unhandled rejection", error);
//   }
// });
