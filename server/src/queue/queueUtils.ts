import type {
	ApiVersion,
	AppEnv,
	EventInsert,
	FinalizeLockParamsV0,
	Price,
	TrackParams,
	UpdateBalanceParamsV0,
} from "@autumn/shared";
import {
	SendMessageBatchCommand,
	type SendMessageBatchCommandOutput,
	SendMessageCommand,
} from "@aws-sdk/client-sqs";
import { metrics } from "@opentelemetry/api";
import { generateId } from "@server/utils/genUtils";
import type { StripeWebhookReplayPayload } from "@/external/stripe/webhookReplay/runStripeWebhookReplay.js";
import type { BatchResetCustomerEntitlementsV2Payload } from "@/internal/balances/batchReset/types.js";
import type { CustomerCreationRecoveryPayload } from "@/internal/customers/recovery/customerCreationRecoveryTypes.js";
import type { ClearCreditSystemCachePayload } from "@/internal/features/featureActions/runClearCreditSystemCacheTask.js";
import type { GenerateFeatureDisplayPayload } from "@/internal/features/workflows/generateFeatureDisplay.js";
import { getSqsClient } from "./initSqs.js";
import { JobName } from "./JobName.js";
import { SqsBatchAccumulator } from "./SqsBatchAccumulator.js";
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
	[JobName.UpdateBalance]: {
		orgId: string;
		env: AppEnv;
		customerId: string;
		entityId?: string;
		requestId: string;
		params: UpdateBalanceParamsV0;
		targetBalance?: number;
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
	[JobName.BatchResetCustomerEntitlementsV2]: BatchResetCustomerEntitlementsV2Payload;
	[JobName.AutoTopUp]: {
		orgId: string;
		env: AppEnv;
		customerId: string;
		featureId: string;
	};
	[JobName.ExpireLockReceipt]: {
		orgId: string;
		env: AppEnv;
		customerId: string;
		lockId: string;
		hashedKey: string;
	};
	[JobName.FinalizeLock]: {
		orgId: string;
		env: AppEnv;
		customerId?: string;
		requestId: string;
		params: FinalizeLockParamsV0;
	};
	[key: string]: unknown;
}

const SQS_SEND_MESSAGE_BATCH_LIMIT = 10;
const meter = metrics.getMeter("autumn-server");
const sendBatchCallsCounter = meter.createCounter(
	"autumn.sqs.send_batch.calls",
	{ description: "SQS SendMessageBatch API calls" },
);
const sendBatchEntriesCounter = meter.createCounter(
	"autumn.sqs.send_batch.entries",
	{ description: "Entries submitted through SQS SendMessageBatch" },
);
const sendBatchFailuresCounter = meter.createCounter(
	"autumn.sqs.send_batch.failures",
	{ description: "Entries that failed during SQS SendMessageBatch" },
);

const getQueueName = ({ queueUrl }: { queueUrl: string }) =>
	queueUrl.split("/").pop() ?? "unknown";

type SqsBatchMessage = {
	jobName: string;
	messageBody: string;
	messageGroupId?: string;
	messageDeduplicationId?: string;
	delaySeconds?: number;
};

type PrimarySqsQueueEntry = SqsBatchMessage & {
	queueUrl: string;
};

const sendSqsMessagesBatch = async ({
	queueUrl,
	entries,
}: {
	queueUrl: string;
	entries: SqsBatchMessage[];
}): Promise<{
	successCount: number;
	failures: Array<{ index: number; reason: string }>;
}> => {
	const sqsClient = getSqsClient({ queueUrl });
	const queueName = getQueueName({ queueUrl });
	const failures: Array<{ index: number; reason: string }> = [];
	let successCount = 0;

	for (
		let chunkStartIndex = 0;
		chunkStartIndex < entries.length;
		chunkStartIndex += SQS_SEND_MESSAGE_BATCH_LIMIT
	) {
		const chunk = entries.slice(
			chunkStartIndex,
			chunkStartIndex + SQS_SEND_MESSAGE_BATCH_LIMIT,
		);
		sendBatchCallsCounter.add(1, {
			queue_name: queueName,
			batch_size: chunk.length,
		});

		const entryCountByJobName = new Map<string, number>();
		for (const entry of chunk) {
			entryCountByJobName.set(
				entry.jobName,
				(entryCountByJobName.get(entry.jobName) ?? 0) + 1,
			);
		}
		for (const [jobName, entryCount] of entryCountByJobName) {
			sendBatchEntriesCounter.add(entryCount, {
				queue_name: queueName,
				job_name: jobName,
			});
		}

		let response: SendMessageBatchCommandOutput;
		try {
			response = (await sqsClient.send(
				new SendMessageBatchCommand({
					QueueUrl: queueUrl,
					Entries: chunk.map((entry, index) => ({
						Id: index.toString(),
						MessageBody: entry.messageBody,
						...(entry.delaySeconds !== undefined && {
							DelaySeconds: entry.delaySeconds,
						}),
						...(entry.messageGroupId !== undefined && {
							MessageGroupId: entry.messageGroupId,
						}),
						...(entry.messageDeduplicationId !== undefined && {
							MessageDeduplicationId: entry.messageDeduplicationId,
						}),
					})),
				}),
			)) as SendMessageBatchCommandOutput;
		} catch (error) {
			const reason =
				error instanceof Error ? error.message : "Unknown SQS send error";
			for (const [index] of chunk.entries()) {
				failures.push({ index: chunkStartIndex + index, reason });
			}
			sendBatchFailuresCounter.add(chunk.length, {
				queue_name: queueName,
				failure_type: "transport",
			});
			continue;
		}

		const successfulIds = new Set(
			(response.Successful ?? []).map(({ Id }) => Id),
		);
		const failureReasonById = new Map(
			(response.Failed ?? []).map(({ Id, Message, Code }) => [
				Id,
				Message ?? Code ?? "Unknown SQS batch failure",
			]),
		);
		successCount += successfulIds.size;

		let chunkFailureCount = 0;
		for (const [index] of chunk.entries()) {
			const id = index.toString();
			const failureReason = failureReasonById.get(id);
			if (failureReason !== undefined) {
				failures.push({
					index: chunkStartIndex + index,
					reason: failureReason,
				});
				chunkFailureCount += 1;
			} else if (!successfulIds.has(id)) {
				failures.push({
					index: chunkStartIndex + index,
					reason: "SQS batch response omitted the entry result",
				});
				chunkFailureCount += 1;
			}
		}

		if (chunkFailureCount > 0) {
			sendBatchFailuresCounter.add(chunkFailureCount, {
				queue_name: queueName,
				failure_type: "entry",
			});
		}
	}

	return { successCount, failures };
};

const globalPrimarySqsSendBatcher =
	new SqsBatchAccumulator<PrimarySqsQueueEntry>({
		sendBatch: sendSqsMessagesBatch,
	});

export const flushPrimarySqsSendBatcher = (): Promise<void> =>
	globalPrimarySqsSendBatcher.flush();

export const shutdownPrimarySqsSendBatcher = (): Promise<void> =>
	globalPrimarySqsSendBatcher.shutdown();

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

		const messageInput = {
			QueueUrl: resolvedQueueUrl,
			MessageBody: JSON.stringify(message),
			...(delaySeconds && { DelaySeconds: delaySeconds }),
			// FIFO queues require MessageGroupId. Content-based deduplication uses the body.
			...(isFifoQueue && {
				MessageGroupId: messageGroupId || generateId("msg"),
				MessageDeduplicationId: resolvedMessageDeduplicationId,
			}),
		};

		if (resolvedQueueUrl === process.env.SQS_QUEUE_URL_V2) {
			await globalPrimarySqsSendBatcher.enqueue({
				queueUrl: resolvedQueueUrl,
				jobName: jobName as string,
				messageBody: messageInput.MessageBody,
				messageGroupId: messageInput.MessageGroupId,
				messageDeduplicationId: messageInput.MessageDeduplicationId,
				delaySeconds: messageInput.DelaySeconds,
			});
			return;
		}

		const command = new SendMessageCommand(messageInput);
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
}> =>
	sendSqsMessagesBatch({
		queueUrl,
		entries: entries.map(
			({ payload, messageGroupId, messageDeduplicationId }) => ({
				jobName: jobName as string,
				messageBody: JSON.stringify({
					name: jobName as string,
					data: payload,
				}),
				messageGroupId,
				messageDeduplicationId,
			}),
		),
	});
