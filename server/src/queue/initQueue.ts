import { Queue } from "bullmq";
import { Redis } from "ioredis";

if (!process.env.QUEUE_URL) {
	throw new Error("QUEUE_URL is not set");
}

export const queue = new Queue("autumn", {
	connection: {
		url: process.env.QUEUE_URL,
		enableOfflineQueue: false,
		retryStrategy: () => {
			return 5000;
		},
	},
});

export const queueRedis = new Redis(process.env.QUEUE_URL);

// Separate Redis connection for BullMQ Workers (requires maxRetriesPerRequest: null)
export const workerRedis = new Redis(process.env.QUEUE_URL, {
	maxRetriesPerRequest: null,
	enableReadyCheck: false,
	enableOfflineQueue: false,
});
