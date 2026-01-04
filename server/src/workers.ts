// Suppress BullMQ eviction policy warnings BEFORE any imports
const originalWarn = console.warn;
console.warn = (...args: any[]) => {
	const msg = args.join(" ");
	if (msg.includes("Eviction policy")) {
		return;
	}
	originalWarn.apply(console, args);
};

import "dotenv/config";
import cluster from "node:cluster";

import { initInfisical } from "./external/infisical/initInfisical.js";
import { initHatchetWorker } from "./queue/initWorkers.js";

// Number of worker processes (defaults to CPU cores)
const NUM_PROCESSES = process.env.NODE_ENV === "development" ? 1 : 4;

// Track if we're shutting down
let isShuttingDown = false;

if (cluster.isPrimary) {
	await initInfisical();

	await initHatchetWorker();

	// Check if queue is configured before starting workers
	if (!process.env.SQS_QUEUE_URL && !process.env.QUEUE_URL) {
		console.log("⏭️  No queue configured. Skipping workers startup.");
		console.log("   Set either SQS_QUEUE_URL or QUEUE_URL to enable workers.");
		process.exit(0);
	}

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
	console.log(`[Worker ${process.pid}] Starting queue consumer...`);

	// Auto-detect which queue implementation to use
	if (process.env.SQS_QUEUE_URL) {
		console.log(`[Worker ${process.pid}] Using SQS queue implementation`);
		const { initWorkers } = await import("./queue/initWorkers.js");
		await initWorkers();
		// SQS implementation handles its own SIGTERM/SIGINT
	} else if (process.env.QUEUE_URL) {
		console.log(`[Worker ${process.pid}] Using BullMQ queue implementation`);
		const { initWorkers } = await import("./queue/bullmq/initBullMqWorkers.js");
		await initWorkers();
		// BullMQ implementation handles its own SIGTERM/SIGINT
	} else {
		console.error("No queue configured. Set either SQS_QUEUE_URL or QUEUE_URL");
		process.exit(1);
	}
}
