import { config } from "dotenv";
config();

import "./instrumentation.js";
import { trace, context } from "@opentelemetry/api";

import http from "http";
import cluster from "cluster";
import os from "os";
import mainRouter from "./internal/mainRouter.js";
import express from "express";
import cors from "cors";

import webhooksRouter from "./external/webhooks/webhooksRouter.js";

import { apiRouter } from "./internal/api/apiRouter.js";
import { QueueManager } from "./queue/QueueManager.js";
import { AppEnv } from "@autumn/shared";
import { CacheManager } from "./external/caching/CacheManager.js";
import { logger } from "./external/logtail/logtailUtils.js";
import { createPosthogCli } from "./external/posthog/createPosthogCli.js";
import { generateId } from "./utils/genUtils.js";
import { subscribeToOrgUpdates } from "./external/supabase/subscribeToOrgUpdates.js";
import { client, db } from "./db/initDrizzle.js";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./utils/auth.js";
import { checkEnvVars } from "./utils/initUtils.js";
import { ClickHouseManager } from "./external/clickhouse/ClickHouseManager.js";

const tracer = trace.getTracer("express");

checkEnvVars();
// subscribeToOrgUpdates({ db });

const init = async () => {
  const app = express();

  // Check if this blocks API calls...
  app.use(
    cors({
      origin: [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:5174",
        "https://app.useautumn.com",
        "https://staging.useautumn.com",
        "https://*.useautumn.com",
        "https://localhost:8080",
        "https://app.aidvize.com",
        "http://staging.aidvize.com",
        "https://www.alphalog.ai",
        "https://*.alphalog.ai",
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
    })
  );

  app.all("/api/auth/*", toNodeHandler(auth));

  const server = http.createServer(app);
  const posthog = createPosthogCli();

  server.keepAliveTimeout = 120000; // 120 seconds
  server.headersTimeout = 120000; // 120 seconds should be >= keepAliveTimeout

  await QueueManager.getInstance(); // initialize the queue manager
  await CacheManager.getInstance();
  await ClickHouseManager.getInstance();

  app.use(async (req: any, res: any, next: any) => {
    req.env = req.env = req.headers["app_env"] || AppEnv.Sandbox;
    req.db = db;
    req.clickhouseClient = await ClickHouseManager.getClient();
    req.posthog = posthog;
    req.id = req.headers["rndr-id"] || generateId("local_req");
    req.timestamp = Date.now();

    const reqContext = {
      id: req.id,
      env: req.headers["app_env"] || undefined,
      method: req.method,
      url: req.originalUrl,
      timestamp: req.timestamp,
    };

    // Create span
    const spanName = `${req.method} ${req.originalUrl} - ${req.id}`;
    const span = tracer.startSpan(spanName);
    span.setAttributes({
      req_id: req.id,
      method: req.method,
      url: req.originalUrl,
    });

    // Store span on request for potential use in other middleware/handlers
    req.span = span;

    req.logtail = logger.child({
      context: {
        req: reqContext,
      },
    });
    req.logger = req.logtail;

    const endSpan = () => {
      try {
        span.setAttributes({
          "http.response.status_code": res.statusCode,
          "http.response.body.size": res.get("content-length") || 0,
          "http.response.duration": Date.now() - req.timestamp,
        });
        span.end();

        const closeSpan = tracer.startSpan("response_closed");
        closeSpan.setAttributes({
          req_id: req.id,
        });
        closeSpan.end();
      } catch (error) {
        logger.error("Error ending span", { error });
      }
    };

    res.on("close", endSpan);

    // Run the rest of the request processing within the span's context
    context.with(trace.setSpan(context.active(), span), () => {
      next();
    });
  });

  app.use("/webhooks", webhooksRouter);

  app.use(express.json());
  app.use(async (req: any, res: any, next: any) => {
    req.logtail.info(`${req.method} ${req.originalUrl}`, {
      context: {
        body: req.body,
      },
    });
    next();
  });

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
