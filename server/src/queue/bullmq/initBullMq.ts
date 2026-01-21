import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { loadCaCert } from "../../external/redis/loadCaCert.js";

if (!process.env.QUEUE_URL) {
	throw new Error("QUEUE_URL is not set");
}

const caText = await loadCaCert({
	caPath: process.env.QUEUE_CERT_PATH,
	caValue: process.env.QUEUE_CERT,
	type: "queue",
});

export const queue = new Queue("autumn", {
	connection: {
		url: process.env.QUEUE_URL,
		tls: caText ? { ca: caText } : undefined,
		enableOfflineQueue: false,
		retryStrategy: () => {
			return 5000;
		},
	},
});

export const queueRedis = new Redis(process.env.QUEUE_URL, {
	tls: caText ? { ca: caText } : undefined,
});

// Separate Redis connection for BullMQ Workers (requires maxRetriesPerRequest: null)
export const workerRedis = new Redis(process.env.QUEUE_URL, {
	tls: caText ? { ca: caText } : undefined,
	maxRetriesPerRequest: null,
	enableReadyCheck: false,
	enableOfflineQueue: false,
});

queueRedis.on("error", (error) => {
	// logger.error(`redis (queue) error: ${error.message}`);
});

workerRedis.on("error", (error) => {
	// logger.error(`redis (queue) error: ${error.message}`);
});
