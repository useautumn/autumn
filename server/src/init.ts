// Suppress BullMQ eviction policy warnings BEFORE any imports

// Skip OpenTelemetry instrumentation in development for faster startup
if (process.env.NODE_ENV !== "development") {
	await import("./instrumentation.js");
}

import cluster from "node:cluster";
import http from "node:http";
import os from "node:os";
import { AppEnv } from "@autumn/shared";
import { context, trace } from "@opentelemetry/api";
import { toNodeHandler } from "better-auth/node";
import cors from "cors";
import express from "express";
import { client, db } from "./db/initDrizzle.js";
import { ClickHouseManager } from "./external/clickhouse/ClickHouseManager.js";
import { logger } from "./external/logtail/logtailUtils.js";
import webhooksRouter from "./external/webhooks/webhooksRouter.js";
import { redirectToHono } from "./initHono.js";
import { apiRouter } from "./internal/api/apiRouter.js";
import mainRouter from "./internal/mainRouter.js";
import { auth } from "./utils/auth.js";
import { generateId } from "./utils/genUtils.js";
import { checkEnvVars } from "./utils/initUtils.js";

const tracer = trace.getTracer("express");

checkEnvVars();
// subscribeToOrgUpdates({ db });

const init = async () => {
	const app = express();
	const server = http.createServer(app);
	server.keepAliveTimeout = 120000; // 120 seconds
	server.headersTimeout = 120000; // 120 seconds should be >= keepAliveTimeout

	app.use(redirectToHono());

	// Check if this blocks API calls...
	const allowedOrigins = [
		"http://localhost:3000",
		"http://localhost:5173",
		"http://localhost:5174",
		"https://app.useautumn.com",
		"https://staging.useautumn.com",
		"https://api.staging.useautumn.com",
		"https://localhost:8080",
		"https://www.alphalog.ai",
		process.env.CLIENT_URL || "",
	];

	// Add dynamic port origins in development
	if (process.env.NODE_ENV === "development") {
		// Add ports 3000-3010 and 8080-8090 for multiple instances
		for (let i = 0; i <= 10; i++) {
			allowedOrigins.push(`http://localhost:${3000 + i}`);
			allowedOrigins.push(`http://localhost:${8080 + i}`);
		}
	}

	// Wildcard patterns for subdomains
	const wildcardPatterns = [
		/^https:\/\/.*\.useautumn\.com$/,
		/^https:\/\/.*\.alphalog\.ai$/,
		/^https:\/\/.*\.alphalog\.ai$/,
		/^chrome-extension:\/\/.*/,
	];

	app.use(
		cors({
			origin: (origin, callback) => {
				// Allow requests with no origin (like mobile apps or curl)
				if (!origin) {
					callback(null, true);
					return;
				}

				// Check explicit allowed origins
				if (allowedOrigins.includes(origin)) {
					callback(null, true);
					return;
				}

				// Check wildcard patterns
				if (wildcardPatterns.some((pattern) => pattern.test(origin))) {
					callback(null, true);
					return;
				}

				// Origin not allowed
				callback(new Error("Not allowed by CORS"));
			},
			credentials: true,
			allowedHeaders: [
				"app_env",
				"x-api-version",
				"x-client-type",
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

	// Initialize managers in parallel for faster startup
	await Promise.all([ClickHouseManager.getInstance()]);

	app.use(async (req: any, res: any, next: any) => {
		// Add Render region identifier headers for load balancer verification
		const serviceName = process.env.RENDER_SERVICE_NAME || "unknown";
		const externalHostname = process.env.RENDER_EXTERNAL_HOSTNAME || "unknown";
		res.setHeader("x-render-service", serviceName);
		res.setHeader("x-render-hostname", externalHostname);

		req.env = req.env = req.headers.app_env || AppEnv.Sandbox;
		req.db = db;
		req.clickhouseClient = await ClickHouseManager.getClient();
		req.id = req.headers["rndr-id"] || generateId("local_req");
		req.timestamp = Date.now();
		req.expand = [];
		req.skipCache = false;

		const reqContext = {
			id: req.id,
			env: req.headers.app_env || undefined,
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

		req.logger = logger.child({
			context: {
				req: reqContext,
			},
		});

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
		req.logger.info(`${req.method} ${req.originalUrl}`, {
			context: {
				body: req.body,
			},
		});
		next();
	});

	// Legacy Express routes
	app.use(mainRouter);
	app.use("/v1", apiRouter);

	const PORT = process.env.SERVER_PORT
		? Number.parseInt(process.env.SERVER_PORT)
		: 8080;

	// Bind to 0.0.0.0 for AWS ECS/Docker containers
	server.listen(PORT, "0.0.0.0", () => {
		console.log(`Server running on port ${PORT}`);
	});
};

if (process.env.NODE_ENV === "development") {
	init();
	registerShutdownHandlers();
} else {
	const numCPUs = os.cpus().length;

	if (cluster.isPrimary) {
		console.log(`Master ${process.pid} is running`);
		console.log("Number of CPUs", numCPUs);

		const numWorkers = 2;

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
