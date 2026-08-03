import type {
	ApiVersion,
	AppEnv,
	EventInsert,
	FinalizeLockParamsV0,
	Price,
	TrackParams,
	UpdateBalanceParamsV0,
} from "@autumn/shared";
import { SendMessageCommand } from "@aws-sdk/client-sqs";
import { generateId } from "@server/utils/genUtils";
import type { StripeWebhookReplayPayload } from "@/external/stripe/webhookReplay/runStripeWebhookReplay.js";
import type { BatchResetCustomerEntitlementsV2Payload } from "@/internal/balances/batchReset/types.js";
import type { CustomerCreationRecoveryPayload } from "@/internal/customers/recovery/customerCreationRecoveryTypes.js";
import type { ClearCreditSystemCachePayload } from "@/internal/features/featureActions/runClearCreditSystemCacheTask.js";
import type { GenerateFeatureDisplayPayload } from "@/internal/features/workflows/generateFeatureDisplay.js";
import { getSqsClient } from "./initSqs.js";
import { JobName } from "./JobName.js";
import { SqsBatchAccumulator } from "./SqsBatchAccumulator.js";
import {
	type SqsBatchMessage,
	type SqsSendResult,
	sendSqsMessagesBatch,
} from "./utils/sendSqsMessages.js";
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

type PrimarySqsQueueEntry = SqsBatchMessage & {
	queueUrl: string;
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
}): Promise<SqsSendResult> =>
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
