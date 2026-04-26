// Entry point: Load Infisical secrets, then start the app
// Instead of:
import "dotenv/config";

// Prevent BullMQ/ioredis connection errors from crashing the process when Redis is unavailable.
// These are expected in degraded-mode operation and are handled at the call site.
process.on("unhandledRejection", (reason) => {
	const message = reason instanceof Error ? reason.message : String(reason);
	if (
		message.includes("maxRetriesPerRequest") ||
		message.includes("enableOfflineQueue") ||
		message.includes("Stream isn't writeable")
	) {
		console.warn("[queue] Redis unavailable, job dropped:", message);
		return;
	}
	// Re-throw all other unhandled rejections so real bugs still crash the process
	throw reason;
});

import cluster from "node:cluster";

import { initInfisical } from "./external/infisical/initInfisical.js";

// Load Infisical secrets into process.env ONLY in master/primary process
// Infisical will NOT override existing env vars (from .env above)
if (cluster.isPrimary) {
	await initInfisical();
}

// Now dynamically import and run the main app
await import("./instrumentation.js");
await import("./init.js");
