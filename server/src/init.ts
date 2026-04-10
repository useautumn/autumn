// Sentry + OpenTelemetry must be imported before any application code
await import("./sentry.js");

import cluster from "node:cluster";
import http from "node:http";
import os from "node:os";
import { getRequestListener } from "@hono/node-server";
import { client, clientCritical, clientReplica } from "./db/initDrizzle.js";
import {
	initPgHealthMonitor,
	shutdownPgHealthMonitor,
} from "./db/pgHealthMonitor.js";
import { logger } from "./external/logtail/logtailUtils.js";
import {
	startAllEdgeConfigPolling,
	stopAllEdgeConfigPolling,
} from "./internal/misc/edgeConfig/edgeConfigRegistry.js";

// Edge config modules self-register on import
import "./internal/misc/requestBlocks/requestBlockStore.js";
import "./internal/misc/featureFlags/featureFlagStore.js";
import "./internal/misc/customerBlocks/customerBlockStore.js";
import "./internal/misc/edgeConfig/orgLimitsStore.js";
import "./internal/misc/stripeSync/stripeSyncStore.js";
import { closeStripeSyncEngine } from "@autumn/stripe-sync";
import { warmupRegionalRedis } from "./external/redis/initRedis.js";
import { createHonoApp } from "./initHono.js";
import { otelSdk } from "./instrumentation.js";
import { checkEnvVars } from "./utils/initUtils.js";
import { startMemoryMonitor } from "./utils/memoryMonitor.js";

checkEnvVars();

const init = async () => {
	console.time("init:create-hono-app");
	const app = createHonoApp();
	console.timeEnd("init:create-hono-app");

	console.time("init:pg-health-monitor");
	initPgHealthMonitor({ client: clientCritical });
	console.timeEnd("init:pg-health-monitor");

	console.time("init:redis-warmup");
	await Promise.all([warmupRegionalRedis()]);
	console.timeEnd("init:redis-warmup");
	await startAllEdgeConfigPolling({ logger });

	const PORT = process.env.SERVER_PORT
		? Number.parseInt(process.env.SERVER_PORT)
		: 8080;

	console.time("init:setup-server");
	const requestListener = getRequestListener(app.fetch);
	const server = http.createServer(requestListener);

	server.keepAliveTimeout = 120000;
	server.headersTimeout = 120000;
	console.timeEnd("init:setup-server");

	console.time("init:server-listen");
	server.listen(PORT, "0.0.0.0", () => {
		console.timeEnd("init:server-listen");
		console.log(`Server running on port ${PORT}`);
		startMemoryMonitor("server", 60_000);
	});
};

if (process.env.NODE_ENV === "development") {
	console.time("init:dev-total");
	init();
	registerShutdownHandlers();
	console.timeEnd("init:dev-total");
} else {
	const numCPUs = os.cpus().length;

	if (cluster.isPrimary) {
		console.time("init:master-start");
		console.log(`Master ${process.pid} is running`);
		console.log("Number of CPUs", numCPUs);

		const numWorkers = 3;

		for (let i = 0; i < numWorkers; i++) {
			console.time(`init:worker-fork-${i}`);
			cluster.fork();
			console.timeEnd(`init:worker-fork-${i}`);
		}

		cluster.on("exit", (worker, _code, _signal) => {
			logger.error(`WORKER DIED: ${worker.process.pid}`);
			cluster.fork();
		});

		registerShutdownHandlers();
		console.timeEnd("init:master-start");
	} else {
		console.time(`init:worker-${process.pid}-total`);
		init();
		registerShutdownHandlers();
		console.timeEnd(`init:worker-${process.pid}-total`);
	}
}

function registerShutdownHandlers() {
	process.on("SIGTERM", gracefulShutdown);
	process.on("SIGINT", gracefulShutdown);
	// Do NOT use process.on("exit", ...) for async cleanup!
}

async function gracefulShutdown() {
	console.log("Shutting down worker, flushing telemetry and closing DB...");
	try {
		// Flush any buffered OTel spans before shutting down
		if (otelSdk) {
			await otelSdk.shutdown();
		}
		shutdownPgHealthMonitor();
		stopAllEdgeConfigPolling();
		await Promise.all([
			client.end(),
			clientCritical.end(),
			clientReplica?.end(),
			closeStripeSyncEngine(),
		]);
		console.log("Shutdown complete. Exiting process.");
		process.exit(0);
	} catch (err) {
		console.error("Error during graceful shutdown:", err);
		process.exit(1);
	}
}
