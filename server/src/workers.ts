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
import os from "node:os";
import { initInfisical } from "./external/infisical/initInfisical.js";

// Number of worker processes (defaults to CPU cores)
const NUM_PROCESSES =
	process.env.NODE_ENV === "development"
		? 1
		: Number.parseInt(process.env.WORKER_PROCESSES || String(os.cpus().length));

if (cluster.isPrimary) {
	await initInfisical();

	console.log(`Starting ${NUM_PROCESSES} worker processes`);

	// Fork workers
	for (let i = 0; i < NUM_PROCESSES; i++) {
		cluster.fork();
	}

	// Handle worker exits and restart them
	cluster.on("exit", (worker, code, signal) => {
		console.log(
			`⚠️  Worker ${worker.process.pid} died (${signal || code}). Restarting...`,
		);
		cluster.fork();
	});
} else {
	// Worker process
	console.log(`[Worker ${process.pid}] Starting queue consumer...`);

	// Auto-detect which queue implementation to use
	if (process.env.SQS_QUEUE_URL) {
		console.log(`[Worker ${process.pid}] Using SQS queue implementation`);
		const { initWorkers } = await import("./queue/initWorkers.js");
		await initWorkers();
	} else if (process.env.QUEUE_URL) {
		console.log(`[Worker ${process.pid}] Using BullMQ queue implementation`);
		const { initWorkers } = await import("./queue/bullmq/initBullMqWorkers.js");
		await initWorkers();
	} else {
		console.error("No queue configured. Set either SQS_QUEUE_URL or QUEUE_URL");
		process.exit(1);
	}
}
