import { config } from "dotenv";
config();

import http from "http";
import cluster from "cluster";
import os from "os";
import mainRouter from "./internal/mainRouter.js";
import express from "express";
import cors from "cors";
import chalk from "chalk";

import webhooksRouter from "./external/webhooks/webhooksRouter.js";

import { apiRouter } from "./internal/api/apiRouter.js";
import { QueueManager } from "./queue/QueueManager.js";
import { AppEnv } from "@autumn/shared";
import { createLogtail } from "./external/logtail/logtailUtils.js";
import { CacheManager } from "./external/caching/CacheManager.js";

import { logtailAll, logger } from "./external/logtail/logtailUtils.js";
import { createPosthogCli } from "./external/posthog/createPosthogCli.js";
import { generateId } from "./utils/genUtils.js";
import { subscribeToOrgUpdates } from "./external/supabase/subscribeToOrgUpdates.js";
import { client, db } from "./db/initDrizzle.js";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./utils/auth.js";
import { checkEnvVars } from "./utils/initUtils.js";

checkEnvVars();
const init = async () => {
  const app = express();

  // Check if this blocks API calls...
  app.use(
    cors({
      origin: [
        "http://localhost:3000",
        "https://app.useautumn.com",
        "https://*.useautumn.com",
        "https://localhost:8080",
        process.env.CLIENT_URL || "",
      ],
      credentials: true,
      allowedHeaders: [
        "app_env",
        "x-api-version",
        "Authorization",
        "Content-Type",
        "Accept",
        "Origin",
        "X-API-Version",
        "X-Requested-With",
        "Access-Control-Request-Method",
        "Access-Control-Request-Headers",
        "Cache-Control",
        "If-Match",
        "If-None-Match",
        "If-Modified-Since",
        "If-Unmodified-Since",
      ],
    }),
  );

  app.all("/api/auth/*", toNodeHandler(auth));

  const server = http.createServer(app);
  const posthog = createPosthogCli();

  server.keepAliveTimeout = 120000; // 120 seconds
  server.headersTimeout = 120000; // 120 seconds should be >= keepAliveTimeout

  await QueueManager.getInstance(); // initialize the queue manager
  await CacheManager.getInstance();

  subscribeToOrgUpdates({ db });

  app.use((req: any, res: any, next: any) => {
    req.env = req.env = req.headers["app_env"] || AppEnv.Sandbox;
    req.db = db;
    req.logtailAll = logtailAll;
    req.posthog = posthog;

    req.id = req.headers["rndr-id"] || generateId("local_req");
    req.timestamp = Date.now();

    try {
      let headersClone = structuredClone(req.headers);
      headersClone.authorization = undefined;
      headersClone.Authorization = undefined;

      logtailAll?.info(`${req.method} ${req.originalUrl}`, {
        url: req.originalUrl,
        method: req.method,
        headers: headersClone,
        body: req.body,
      });

      req.logtail = createLogtail();
    } catch (error) {
      req.logtail = logger; // fallback
      console.error(`Error creating req.logtail`);
      console.error(error);
    }

    res.on("finish", () => {
      req.logtail.flush();
    });

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

    console.log(`${methodColor(method).padEnd(18)} ${path}`);

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

if (process.env.NODE_ENV === "development") {
  init();
  registerShutdownHandlers();
} else {
  let numCPUs = os.cpus().length;

  if (cluster.isPrimary) {
    console.log(`Master ${process.pid} is running`);
    console.log("Number of CPUs", numCPUs);

    let numWorkers = 10;

    for (let i = 0; i < numWorkers; i++) {
      cluster.fork();
    }

    cluster.on("exit", (worker, code, signal) => {
      logger.error(`WORKER DIED: ${worker.process.pid}`);
      cluster.fork();
    });
  } else {
    init();
    registerShutdownHandlers();
  }
}

function registerShutdownHandlers() {
  process.on("SIGTERM", gracefulShutdown);
  process.on("SIGINT", gracefulShutdown);
  // Do NOT use process.on("exit", ...) for async cleanup!
}

async function gracefulShutdown() {
  console.log("Shutting down worker, closing DB connections...");
  try {
    await client.end();
    console.log("DB connection closed. Exiting process.");
    process.exit(0);
  } catch (err) {
    console.error("Error closing DB connection:", err);
    process.exit(1);
  }
}

// Close connections gracefully?
const closeConnections = async () => {
  console.log("Closing connections");
  await client.end();
};

process.on("SIGTERM", async () => {
  console.log("SIGTERM received, shutting down gracefully");
  await closeConnections();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("SIGINT received, shutting down gracefully");
  await closeConnections();
  process.exit(0);
});
