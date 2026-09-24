import type { SqsEnv } from "@autumn/env/sqs";
import type { QueueBatchConfig } from "../lib/queue/types/queue.js";

/** Every queue Autumn runs, by the name jobs route with. */
export type QueueName =
	| "general"
	| "track"
	| "asyncTrack"
	| "updateBalance"
	| "customerCreationRecovery"
	| "stripeWebhook"
	| "batchReset";

export type QueueDefinition = {
	/** The URL this process should send to, or null when the queue is not configured here. */
	url: (env: SqsEnv) => string | null;
	/** Bursty queues batch sends; the rest go one message at a time. */
	batch: QueueBatchConfig | false;
};

const BURST_BATCH: QueueBatchConfig = {
	windowMs: 10,
	maxEntries: 10,
	maxBodyBytes: 1024 * 1024,
};

/** The routing table: where each queue lives and how it is sent to. URL fallbacks are decided here, nowhere else. */
export const queues: Record<QueueName, QueueDefinition> = {
	general: { url: (env) => env.SQS_GENERAL_QUEUE_URL, batch: BURST_BATCH },
	track: { url: (env) => env.SQS_TRACK_QUEUE_URL, batch: false },
	// Standard queue when provisioned; the legacy FIFO otherwise.
	asyncTrack: {
		url: (env) =>
			env.SQS_ASYNC_TRACK_STANDARD_QUEUE_URL ??
			env.SQS_ASYNC_TRACK_FIFO_QUEUE_URL,
		batch: BURST_BATCH,
	},
	updateBalance: {
		url: (env) =>
			env.SQS_UPDATE_BALANCE_QUEUE_URL ?? env.SQS_ASYNC_TRACK_FIFO_QUEUE_URL,
		batch: false,
	},
	customerCreationRecovery: {
		url: (env) => env.SQS_CUSTOMER_CREATION_RECOVERY_QUEUE_URL,
		batch: false,
	},
	stripeWebhook: {
		url: (env) => env.SQS_STRIPE_WEBHOOK_QUEUE_URL,
		batch: false,
	},
	batchReset: {
		url: (env) => env.SQS_BATCH_RESET_QUEUE_URL ?? env.SQS_GENERAL_QUEUE_URL,
		batch: false,
	},
};
