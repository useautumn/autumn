import type { SqsEnv } from "@autumn/env/sqs";
import type { QueueBatchConfig } from "../lib/queue/types/queue.js";

export type QueueName =
	| "general"
	| "track"
	| "asyncTrack"
	| "updateBalance"
	| "customerCreationRecovery"
	| "stripeWebhook"
	| "batchReset";

export type QueueDefinition = {
	url: (env: SqsEnv) => string | null;
	batch: QueueBatchConfig | false;
};

const BURST_BATCH: QueueBatchConfig = {
	windowMs: 10,
	maxEntries: 10,
	maxBodyBytes: 1024 * 1024,
};

export const queues: Record<QueueName, QueueDefinition> = {
	general: { url: (env) => env.SQS_GENERAL_QUEUE_URL, batch: BURST_BATCH },
	track: { url: (env) => env.SQS_TRACK_QUEUE_URL, batch: false },
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
		url: (env) =>
			env.SQS_CUSTOMER_CREATION_RECOVERY_QUEUE_URL ?? env.SQS_GENERAL_QUEUE_URL,
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
