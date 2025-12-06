import type { AppEnv, EventInsert, Price } from "@autumn/shared";
import { SendMessageCommand } from "@aws-sdk/client-sqs";
import { generateId } from "@server/utils/genUtils";
import { JobName } from "./JobName.js";

export interface Payloads {
	[JobName.RewardMigration]: {
		oldPrices: Price[];
		productId: string;
		orgId: string;
		env: AppEnv;
	};
	[JobName.SyncBalanceBatch]: {
		orgId: string;
		env: AppEnv;
		item: {
			customerId: string;
			featureId: string;
			orgId: string;
			env: string;
			entityId?: string;
			timestamp: number;
		};
	};
	[JobName.InsertEventBatch]: {
		events: EventInsert[];
	};
	[key: string]: any;
}

// Lazy load queue implementations based on environment
let queueImplementation: "sqs" | "bullmq" | null = null;
let sqsClient: any = null;
let sqsQueueUrl: string | null = null;
let bullmqQueue: any = null;

const initializeQueue = async () => {
	if (queueImplementation) return;

	// Check which queue to use based on environment
	if (process.env.SQS_QUEUE_URL) {
		queueImplementation = "sqs";
		const { sqs, QUEUE_URL } = await import("./initSqs.js");
		sqsClient = sqs;
		sqsQueueUrl = QUEUE_URL;
	} else if (process.env.QUEUE_URL) {
		queueImplementation = "bullmq";
		const { queue } = await import("./bullmq/initBullMq.js");
		bullmqQueue = queue;
	} else {
		throw new Error(
			"No queue configured. Set either SQS_QUEUE_URL or QUEUE_URL",
		);
	}
};

/**
 * Add a task to the queue (auto-detects SQS or BullMQ)
 */
export const addTaskToQueue = async <T extends keyof Payloads>({
	jobName,
	payload,
	messageGroupId,
	messageDeduplicationId,
}: {
	jobName: T;
	payload: Payloads[T];
	messageGroupId?: string;
	messageDeduplicationId?: string;
}) => {
	await initializeQueue();

	if (queueImplementation === "sqs") {
		// SQS implementation
		const isFifoQueue = sqsQueueUrl?.endsWith(".fifo");
		const message = {
			name: jobName as string,
			data: payload,
		};

		const command = new SendMessageCommand({
			QueueUrl: sqsQueueUrl!,
			MessageBody: JSON.stringify(message),
			// FIFO queues require MessageGroupId and MessageDeduplicationId
			...(isFifoQueue && {
				MessageGroupId: messageGroupId || generateId("msg"),
				// Use provided deduplication ID or generate random (fallback)
				MessageDeduplicationId: messageDeduplicationId || generateId("dedup"),
			}),
		});

		await sqsClient.send(command);
	} else {
		// BullMQ implementation (ignores messageGroupId)
		await bullmqQueue.add(jobName as string, payload);
	}
};
