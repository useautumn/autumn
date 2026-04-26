import type {
	ApiVersion,
	AppEnv,
	EventInsert,
	Price,
	TrackParams,
} from "@autumn/shared";
import { SendMessageCommand } from "@aws-sdk/client-sqs";
import { generateId } from "@server/utils/genUtils";
import type { ClearCreditSystemCachePayload } from "@/internal/features/featureActions/runClearCreditSystemCacheTask.js";
import type { GenerateFeatureDisplayPayload } from "@/internal/features/workflows/generateFeatureDisplay.js";
import { getSqsClient } from "./initSqs.js";
import { JobName } from "./JobName.js";
import type {
	BatchResetCusEntsPayload,
	SendProductsUpdatedPayload,
} from "./workflows.js";

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
	[JobName.SyncBalanceBatchV3]: {
		customerId: string;
		orgId: string;
		env: AppEnv;
		region?: string;
		timestamp: number;
		cusEntIds: string[];
		rolloverIds?: string[];
		entityId?: string;
	};
	[JobName.SyncBalanceBatchV4]: {
		customerId: string;
		orgId: string;
		env: AppEnv;
		region?: string;
		timestamp: number;
		cusEntIds: string[];
		rolloverIds?: string[];
		entityId?: string;
		modifiedCusEntIdsByFeatureId: Record<string, string[]>;
	};
	[JobName.RefreshEntityAggregate]: {
		customerId: string;
		orgId: string;
		env: AppEnv;
		region?: string;
		internalFeatureIds: string[];
	};
	[JobName.InsertEventBatch]: {
		events: EventInsert[];
	};
	[JobName.Track]: {
		orgId: string;
		env: AppEnv;
		customerId: string;
		entityId?: string;
		requestId: string;
		apiVersion: ApiVersion;
		body: TrackParams;
	};
	[JobName.ClearCreditSystemCustomerCache]: ClearCreditSystemCachePayload;
	[JobName.GenerateFeatureDisplay]: GenerateFeatureDisplayPayload;
	[JobName.SendProductsUpdated]: SendProductsUpdatedPayload;
	[JobName.BatchResetCusEnts]: BatchResetCusEntsPayload;
	[JobName.AutoTopUp]: {
		orgId: string;
		env: AppEnv;
		customerId: string;
		featureId: string;
	};
	[JobName.VerifyCacheConsistency]: {
		customerId: string;
		orgId: string;
		env: string;
		source: string;
	};
	[JobName.ExpireLockReceipt]: {
		orgId: string;
		env: AppEnv;
		customerId: string;
		lockId: string;
		hashedKey: string;
	};
	[key: string]: unknown;
}

/**
 * Add a task to the queue (auto-detects SQS or BullMQ)
 */
export const addTaskToQueue = async <T extends keyof Payloads>({
	jobName,
	payload,
	messageGroupId,
	messageDeduplicationId,
	generateDeduplicationId,
	delayMs,
	queueUrl,
}: {
	jobName: T;
	payload: Payloads[T];
	messageGroupId?: string;
	messageDeduplicationId?: string;
	generateDeduplicationId?: boolean;
	delayMs?: number;
	queueUrl?: string;
}) => {
	const resolvedQueueUrl = queueUrl || process.env.SQS_QUEUE_URL;

	if (resolvedQueueUrl) {
		const sqsClient = getSqsClient();

		// SQS implementation
		const isFifoQueue = resolvedQueueUrl.endsWith(".fifo");
		const messageId =
			generateDeduplicationId === false ? undefined : generateId("job");
		const message = {
			...(messageId && { id: messageId }),
			name: jobName as string,
			data: payload,
		};

		// Convert milliseconds to seconds for SQS (max 900 seconds)
		const delaySeconds = delayMs
			? Math.min(Math.floor(delayMs / 1000), 900)
			: undefined;

		const resolvedMessageDeduplicationId =
			messageDeduplicationId ??
			Bun.hash(messageId ?? generateId("dedup")).toString();

		const command = new SendMessageCommand({
			QueueUrl: resolvedQueueUrl,
			MessageBody: JSON.stringify(message),
			...(delaySeconds && { DelaySeconds: delaySeconds }),
			// FIFO queues require MessageGroupId. Content-based deduplication uses the body.
			...(isFifoQueue && {
				MessageGroupId: messageGroupId || generateId("msg"),
				MessageDeduplicationId: resolvedMessageDeduplicationId,
			}),
		});

		await sqsClient.send(command);
		return;
	}

	if (process.env.QUEUE_URL) {
		const { queue } = await import("./bullmq/initBullMq.js");

		// BullMQ dedup: if a stable dedup ID is provided, use it as the jobId.
		// BullMQ ignores jobs whose jobId already exists in the queue (not yet completed).
		try {
			await queue.add(jobName as string, payload, {
				delay: delayMs,
				...(messageDeduplicationId && { jobId: messageDeduplicationId }),
			});
		} catch (error) {
			console.warn(
				`[BullMQ] Failed to enqueue job ${jobName} — Redis may be unavailable:`,
				(error as Error).message,
			);
		}
		return;
	}

	throw new Error("No queue configured. Set either SQS_QUEUE_URL or QUEUE_URL");
};
