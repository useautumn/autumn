// Sentry + OpenTelemetry must be imported before any application code
await import("./sentry.js");

import cluster from "node:cluster";
import http from "node:http";
import os from "node:os";
import { getRequestListener } from "@hono/node-server";
import { client, clientCritical } from "./db/initDrizzle.js";
import { logger } from "./external/logtail/logtailUtils.js";
import { warmupRegionalRedis } from "./external/redis/initRedis.js";
import { createHonoApp } from "./initHono.js";
import { otelSdk } from "./instrumentation.js";
import { checkEnvVars } from "./utils/initUtils.js";
import { startMemoryMonitor } from "./utils/memoryMonitor.js";

checkEnvVars();

const init = async () => {
	const app = createHonoApp();

	await Promise.all([warmupRegionalRedis()]);

	const PORT = process.env.SERVER_PORT
		? Number.parseInt(process.env.SERVER_PORT)
		: 8080;

	const requestListener = getRequestListener(app.fetch);
	const server = http.createServer(requestListener);

	server.keepAliveTimeout = 120000;
	server.headersTimeout = 120000;

	server.listen(PORT, "0.0.0.0", () => {
		console.log(`Server running on port ${PORT}`);
		startMemoryMonitor("server", 60_000);
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

		cluster.on("exit", (worker, _code, _signal) => {
			logger.error(`WORKER DIED: ${worker.process.pid}`);
			cluster.fork();
		});

		registerShutdownHandlers();
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
	console.log("Shutting down worker, flushing telemetry and closing DB...");
	try {
		// Flush any buffered OTel spans before shutting down
		if (otelSdk) {
			await otelSdk.shutdown();
		}
		await Promise.all([client.end(), clientCritical.end()]);
		console.log("Shutdown complete. Exiting process.");
		process.exit(0);
	} catch (err) {
		console.error("Error during graceful shutdown:", err);
		process.exit(1);
	}
}
