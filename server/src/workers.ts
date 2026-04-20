import "dotenv/config";
import cluster from "node:cluster";

import { initInfisical } from "./external/infisical/initInfisical.js";
import { logger } from "./external/logtail/logtailUtils.js";
import {
	startAllEdgeConfigPolling,
	stopAllEdgeConfigPolling,
} from "./internal/misc/edgeConfig/edgeConfigRegistry.js";
import "./internal/misc/requestBlocks/requestBlockStore.js";
import "./internal/misc/rollouts/rolloutConfigStore.js";
import "./internal/misc/redisV2Cache/redisV2CacheStore.js";

// Number of worker processes (defaults to CPU cores)
const NUM_PROCESSES = process.env.NODE_ENV === "development" ? 3 : 4;

// Track if we're shutting down
let isShuttingDown = false;

import { startMemoryMonitor } from "./utils/memoryMonitor.js";

if (cluster.isPrimary) {
	await initInfisical();

	// const { initHatchetWorker } = await import("./queue/initWorkers.js");
	// await initHatchetWorker();

	console.log(`Starting ${NUM_PROCESSES} worker processes`);

	// Fork workers
	for (let i = 0; i < NUM_PROCESSES; i++) {
		cluster.fork();
	}

	// Graceful shutdown handler for primary process
	const shutdown = async () => {
		if (isShuttingDown) return;
		isShuttingDown = true;

		console.log(
			"\n🛑 Received shutdown signal, gracefully shutting down workers...",
		);

		// Send SIGTERM to all workers
		for (const id in cluster.workers) {
			cluster.workers[id]?.kill("SIGTERM");
		}

		// Give workers 10 seconds to finish, then force exit
		const shutdownTimeout = setTimeout(() => {
			console.log("⚠️  Shutdown timeout reached, forcing exit");
			process.exit(0);
		}, 10000);

		if (shutdownTimeout.unref) {
			shutdownTimeout.unref();
		}

		// Wait for all workers to exit gracefully
		const checkWorkers = setInterval(() => {
			const aliveWorkers = Object.keys(cluster.workers || {}).length;
			if (aliveWorkers === 0) {
				clearInterval(checkWorkers);
				clearTimeout(shutdownTimeout);
				console.log("✅ All workers shut down gracefully");
				process.exit(0);
			}
		}, 100);
	};

	process.on("SIGTERM", shutdown);
	process.on("SIGINT", shutdown);

	// Handle worker exits
	cluster.on("exit", (worker, code, signal) => {
		if (isShuttingDown) {
			console.log(`[Worker ${worker.process.pid}] Exited gracefully`);
			return;
		}

		console.log(
			`⚠️  Worker ${worker.process.pid} died unexpectedly (${signal || code}). Restarting...`,
		);

		if (process.env.NODE_ENV === "development") {
			process.exit(1);
		} else {
			cluster.fork();
		}
	});
} else {
	// Worker process
	const startupStartedAt = Date.now();
	const queueImplementation = "SQS";
	startMemoryMonitor("worker", 60_000);
	await startAllEdgeConfigPolling({ logger });

	process.once("exit", stopAllEdgeConfigPolling);

	const { initWorkers } = await import("./queue/initWorkers.js");
	await initWorkers({ startupStartedAt, queueImplementation });
	// SQS implementation handles its own SIGTERM/SIGINT
}
