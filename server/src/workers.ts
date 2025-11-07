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

if (cluster.isPrimary) {
	await initInfisical();
}

// Auto-detect which queue implementation to use
if (process.env.SQS_QUEUE_URL) {
	console.log("Using SQS queue implementation");
	const { initWorkers } = await import("./queue/initWorkers.js");
	await initWorkers();
} else if (process.env.QUEUE_URL) {
	console.log("Using BullMQ queue implementation");
	const { initWorkers } = await import("./queue/bullmq/initWorkers.js");
	await initWorkers();
} else {
	console.error("No queue configured. Set either SQS_QUEUE_URL or QUEUE_URL");
	process.exit(1);
}
