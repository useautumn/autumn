import type {
	ApiVersion,
	AppEnv,
	EventInsert,
	Price,
	TrackParams,
} from "@autumn/shared";
import {
	SendMessageBatchCommand,
	type SendMessageBatchCommandOutput,
	SendMessageCommand,
} from "@aws-sdk/client-sqs";
import { generateId } from "@server/utils/genUtils";
import type { StripeWebhookReplayPayload } from "@/external/stripe/webhookReplay/runStripeWebhookReplay.js";
import type { CustomerCreationRecoveryPayload } from "@/internal/customers/recovery/customerCreationRecoveryTypes.js";
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
	[JobName.SyncCustomerDirty]: {
		customerId: string;
		orgId: string;
		env: AppEnv;
		region?: string;
		redisInstance: string;
		timestamp: number;
	};
	[JobName.CustomerCreationRecovery]: CustomerCreationRecoveryPayload;
	[JobName.StripeWebhookReplay]: StripeWebhookReplayPayload;
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

const SQS_SEND_MESSAGE_BATCH_LIMIT = 10;

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
	const resolvedQueueUrl = queueUrl || process.env.SQS_QUEUE_URL_V2;

	if (resolvedQueueUrl) {
		const sqsClient = getSqsClient({ queueUrl: resolvedQueueUrl });

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

	throw new Error("No queue configured. Set SQS_QUEUE_URL_V2");
};

export const addTasksToQueueBatch = async <T extends keyof Payloads>({
	jobName,
	queueUrl,
	entries,
}: {
	jobName: T;
	queueUrl: string;
	entries: Array<{
		payload: Payloads[T];
		messageGroupId: string;
		messageDeduplicationId: string;
	}>;
}): Promise<{
	successCount: number;
	failures: Array<{ index: number; reason: string }>;
}> => {
	const sqsClient = getSqsClient({ queueUrl });
	const failures: Array<{ index: number; reason: string }> = [];
	let successCount = 0;

	for (
		let chunkStartIndex = 0;
		chunkStartIndex < entries.length;
		chunkStartIndex += SQS_SEND_MESSAGE_BATCH_LIMIT
	) {
		const chunk = entries
			.slice(chunkStartIndex, chunkStartIndex + SQS_SEND_MESSAGE_BATCH_LIMIT)
			.map((entry, index) => {
				const originalIndex = chunkStartIndex + index;

				return {
					originalIndex,
					sqsEntry: {
						Id: index.toString(),
						MessageBody: JSON.stringify({
							name: jobName as string,
							data: entry.payload,
						}),
						MessageGroupId: entry.messageGroupId,
						MessageDeduplicationId: entry.messageDeduplicationId,
					},
				};
			});
		const originalIndexById = new Map(
			chunk.map((entry) => [entry.sqsEntry.Id, entry.originalIndex]),
		);

		const resolveOriginalIndex = (id: string | undefined) => {
			if (id !== undefined) {
				const mapped = originalIndexById.get(id);
				if (mapped !== undefined) return mapped;
				const parsed = Number.parseInt(id, 10);
				if (Number.isFinite(parsed)) return chunkStartIndex + parsed;
			}
			return chunkStartIndex;
		};

		let response: SendMessageBatchCommandOutput;
		try {
			response = (await sqsClient.send(
				new SendMessageBatchCommand({
					QueueUrl: queueUrl,
					Entries: chunk.map((entry) => entry.sqsEntry),
				}),
			)) as SendMessageBatchCommandOutput;
		} catch (error) {
			const reason =
				error instanceof Error ? error.message : "Unknown SQS send error";
			for (const entry of chunk) {
				failures.push({ index: entry.originalIndex, reason });
			}
			continue;
		}

		successCount += response.Successful?.length ?? 0;

		for (const failedEntry of response.Failed ?? []) {
			failures.push({
				index: resolveOriginalIndex(failedEntry.Id),
				reason:
					failedEntry.Message ??
					failedEntry.Code ??
					"Unknown SQS batch failure",
			});
		}
	}

	return { successCount, failures };
};
