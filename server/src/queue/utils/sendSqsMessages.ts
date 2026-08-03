import {
	SendMessageBatchCommand,
	type SendMessageBatchCommandOutput,
	SendMessageCommand,
} from "@aws-sdk/client-sqs";
import { metrics } from "@opentelemetry/api";
import { extractLocalEndpoint, getSqsClient } from "../initSqs.js";

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

export type SqsBatchMessage = {
	jobName: string;
	messageBody: string;
	messageGroupId?: string;
	messageDeduplicationId?: string;
	delaySeconds?: number;
};

export type SqsSendResult = {
	successCount: number;
	failures: Array<{ index: number; reason: string }>;
};

const getQueueName = ({ queueUrl }: { queueUrl: string }) =>
	queueUrl.split("/").pop() ?? "unknown";

const toSqsMessageFields = ({ entry }: { entry: SqsBatchMessage }) => ({
	...(entry.delaySeconds !== undefined && {
		DelaySeconds: entry.delaySeconds,
	}),
	...(entry.messageGroupId !== undefined && {
		MessageGroupId: entry.messageGroupId,
	}),
	...(entry.messageDeduplicationId !== undefined && {
		MessageDeduplicationId: entry.messageDeduplicationId,
	}),
});

const sendSqsMessagesIndividually = async ({
	queueUrl,
	entries,
}: {
	queueUrl: string;
	entries: SqsBatchMessage[];
}): Promise<SqsSendResult> => {
	const sqsClient = getSqsClient({ queueUrl });
	const failures: Array<{ index: number; reason: string }> = [];
	let successCount = 0;

	for (const [index, entry] of entries.entries()) {
		try {
			await sqsClient.send(
				new SendMessageCommand({
					QueueUrl: queueUrl,
					MessageBody: entry.messageBody,
					...toSqsMessageFields({ entry }),
				}),
			);
			successCount += 1;
		} catch (error) {
			failures.push({
				index,
				reason:
					error instanceof Error ? error.message : "Unknown SQS send error",
			});
		}
	}

	return { successCount, failures };
};

export const sendSqsMessagesBatch = async ({
	queueUrl,
	entries,
}: {
	queueUrl: string;
	entries: SqsBatchMessage[];
}): Promise<SqsSendResult> => {
	// goaws (the local SQS emulator) returns batch results under a key the AWS JSON
	// protocol drops, so every entry would look unsent. Only prod really batches.
	if (extractLocalEndpoint({ queueUrl })) {
		return await sendSqsMessagesIndividually({ queueUrl, entries });
	}

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
						...toSqsMessageFields({ entry }),
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
