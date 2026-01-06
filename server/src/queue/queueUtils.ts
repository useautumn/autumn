import type { AppEnv, EventInsert, Price } from "@autumn/shared";
import { SendMessageCommand } from "@aws-sdk/client-sqs";
import { generateId } from "@server/utils/genUtils";
import { isHatchetEnabled } from "@/external/hatchet/initHatchet.js";
import type { ClearCreditSystemCachePayload } from "@/internal/features/featureActions/runClearCreditSystemCacheTask.js";
import {
	type VerifyCacheInput,
	verifyCacheConsistencyWorkflow,
} from "./hatchetWorkflows/verifyCacheConsistencyWorkflow/verifyCacheConsistencyWorkflow.js";
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
	[JobName.ClearCreditSystemCustomerCache]: ClearCreditSystemCachePayload;
	[JobName.VerifyCacheConsistency]: {
		customerId: string;
		orgId: string;
		env: string;
		source: string;
	};
	[key: string]: unknown;
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
	delayMs,
}: {
	jobName: T;
	payload: Payloads[T];
	messageGroupId?: string;
	messageDeduplicationId?: string;
	delayMs?: number;
}) => {
	await initializeQueue();

	if (queueImplementation === "sqs") {
		// SQS implementation
		const isFifoQueue = sqsQueueUrl?.endsWith(".fifo");
		const message = {
			name: jobName as string,
			data: payload,
		};

		// Convert milliseconds to seconds for SQS (max 900 seconds)
		const delaySeconds = delayMs
			? Math.min(Math.floor(delayMs / 1000), 900)
			: undefined;

		const command = new SendMessageCommand({
			QueueUrl: sqsQueueUrl!,
			MessageBody: JSON.stringify(message),
			...(delaySeconds && { DelaySeconds: delaySeconds }),
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
		await bullmqQueue.add(jobName as string, payload, {
			delay: delayMs,
		});
	}
};

// Hatchet workflow payloads
export interface HatchetPayloads {
	[JobName.VerifyCacheConsistency]: VerifyCacheInput;
}

const hatchetWorkflows = {
	[JobName.VerifyCacheConsistency]: verifyCacheConsistencyWorkflow,
};

/**
 * Run a Hatchet workflow (optionally with a delay)
 * Silently skips if Hatchet is not configured
 */
export const runHatchetWorkflow = async <T extends keyof HatchetPayloads>({
	workflowName,
	metadata,
	payload,
	delayMs,
}: {
	workflowName: T;
	metadata?: Record<string, string>;
	payload: HatchetPayloads[T];
	/** Delay in milliseconds before the workflow runs */
	delayMs?: number;
}) => {
	if (!isHatchetEnabled) return;

	const workflow = hatchetWorkflows[workflowName];

	if (!workflow) {
		throw new Error(`No Hatchet workflow registered for: ${workflowName}`);
	}

	if (delayMs) {
		// workflow.delay() takes duration in seconds
		const delaySeconds = Math.floor(delayMs / 1000);
		await workflow.delay(delaySeconds, payload, {
			additionalMetadata: {
				...(metadata ?? {}),
			},
		});
	} else {
		await workflow.run(payload);
	}
};
