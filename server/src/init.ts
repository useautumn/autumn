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
import { getRedactedDatabaseUrls } from "./db/redactDatabaseUrl.js";
import { logger } from "./external/logtail/logtailUtils.js";
import {
	startAllEdgeConfigPolling,
	stopAllEdgeConfigPolling,
} from "./internal/misc/edgeConfig/edgeConfigRegistry.js";

// Edge config modules self-register on import
import "./internal/misc/requestBlocks/requestBlockStore.js";
import "./internal/misc/rollouts/rolloutConfigStore.js";
import "./internal/misc/featureFlags/featureFlagStore.js";
import "./internal/misc/customerBlocks/customerBlockStore.js";
import "./internal/misc/edgeConfig/orgLimitsStore.js";
import "./internal/misc/stripeSync/stripeSyncStore.js";
import "./internal/misc/redisV2Cache/redisV2CacheStore.js";
import { closeStripeSyncEngine } from "@autumn/stripe-sync";
import {
	startRedisMonitor,
	stopRedisMonitor,
	warmupRegionalRedis,
} from "./external/redis/initRedis.js";
import { createHonoApp } from "./initHono.js";
import { otelSdk } from "./instrumentation.js";
import { checkEnvVars } from "./utils/initUtils.js";
import { startMemoryMonitor } from "./utils/memoryMonitor.js";

checkEnvVars();

let shuttingDown = false;

const init = async ({ startupStartedAt }: { startupStartedAt: number }) => {
	logger.info(getRedactedDatabaseUrls(), "DB URLs");

	console.log("DB URLs:", getRedactedDatabaseUrls());

	const app = createHonoApp();

	initPgHealthMonitor({ client: clientCritical });

	startRedisMonitor();
	void warmupRegionalRedis().catch((error) => {
		logger.warn("[Redis] Warmup failed", { error });
	});
	await startAllEdgeConfigPolling({ logger });

	const PORT = process.env.SERVER_PORT
		? Number.parseInt(process.env.SERVER_PORT)
		: 8080;

	const requestListener = getRequestListener(app.fetch);
	const server = http.createServer(requestListener);

	server.keepAliveTimeout = 120000;
	server.headersTimeout = 120000;

	await new Promise<void>((resolve) => {
		server.listen(PORT, "0.0.0.0", () => {
			const startupDurationMs = Date.now() - startupStartedAt;
			console.log(
				`Server running on port ${PORT} (${startupDurationMs}ms startup)`,
			);
			startMemoryMonitor("server", 60_000);
			resolve();
		});
	});
};

if (process.env.NODE_ENV === "development") {
	registerFatalErrorHandlers();
	await init({ startupStartedAt: Date.now() });
	registerShutdownHandlers();
} else {
	const numCPUs = os.cpus().length;

	if (cluster.isPrimary) {
		console.log(`Master ${process.pid} is running`);
		console.log("Number of CPUs", numCPUs);

		const numWorkers = 3;

		for (let i = 0; i < numWorkers; i++) {
			cluster.fork();
		}

		cluster.on("exit", (worker, code, signal) => {
			logger.error("WORKER DIED", {
				pid: worker.process.pid,
				code,
				signal,
				exitedAfterDisconnect: worker.exitedAfterDisconnect,
			});
			if (shuttingDown) return;
			cluster.fork();
		});

		registerShutdownHandlers();
	} else {
		registerFatalErrorHandlers();
		await init({ startupStartedAt: Date.now() });
		registerShutdownHandlers();
	}
}

function registerFatalErrorHandlers() {
	const exitAfterLog = () => setTimeout(() => process.exit(1), 100);
	const logFatal = (event: string, error: unknown) => {
		logger.error(event, {
			error:
				error instanceof Error
					? { name: error.name, message: error.message, stack: error.stack }
					: error,
		});
	};

	process.on("uncaughtException", (error) => {
		logFatal("WORKER FATAL uncaughtException", error);
		exitAfterLog();
	});
	process.on("unhandledRejection", (reason) => {
		logFatal("WORKER FATAL unhandledRejection", reason);
		exitAfterLog();
	});
}

function registerShutdownHandlers() {
	process.on("SIGTERM", gracefulShutdown);
	process.on("SIGINT", gracefulShutdown);
	// Do NOT use process.on("exit", ...) for async cleanup!
}

async function gracefulShutdown() {
	shuttingDown = true;
	console.log("Shutting down worker, flushing telemetry and closing DB...");
	try {
		// Flush any buffered OTel spans before shutting down
		if (otelSdk) {
			await otelSdk.shutdown();
		}
		shutdownPgHealthMonitor();
		stopRedisMonitor();
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
