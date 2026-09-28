import {
	SendMessageBatchCommand,
	SendMessageCommand,
} from "@aws-sdk/client-sqs";
import type { SqsClient } from "../client/types/sqsClient.js";
import type { EntryFailure, QueueEntry } from "./types/queue.js";

const SEND_MESSAGE_BATCH_LIMIT = 10;

const toMessageFields = ({ entry }: { entry: QueueEntry }) => ({
	...(entry.delaySeconds !== undefined && { DelaySeconds: entry.delaySeconds }),
	...(entry.groupId !== undefined && { MessageGroupId: entry.groupId }),
	...(entry.dedupeId !== undefined && {
		MessageDeduplicationId: entry.dedupeId,
	}),
});

const reasonOf = (error: unknown): string =>
	error instanceof Error ? error.message : "Unknown SQS send error";

export const sendEntry = async ({
	client,
	queueUrl,
	entry,
}: {
	client: SqsClient;
	queueUrl: string;
	entry: QueueEntry;
}): Promise<void> => {
	await client.client.send(
		new SendMessageCommand({
			QueueUrl: queueUrl,
			MessageBody: entry.body,
			...toMessageFields({ entry }),
		}),
	);
};

const sendEntriesOneByOne = async ({
	client,
	queueUrl,
	entries,
}: {
	client: SqsClient;
	queueUrl: string;
	entries: QueueEntry[];
}): Promise<EntryFailure[]> => {
	const failures: EntryFailure[] = [];
	for (const [index, entry] of entries.entries()) {
		try {
			await sendEntry({ client, queueUrl, entry });
		} catch (error) {
			failures.push({ index, reason: reasonOf(error) });
		}
	}
	return failures;
};

/** Every entry in as few SendMessageBatch calls as SQS allows; a transport error rejects, a refused entry is a failure. */
export const sendEntries = async ({
	client,
	queueUrl,
	entries,
}: {
	client: SqsClient;
	queueUrl: string;
	entries: QueueEntry[];
}): Promise<EntryFailure[]> => {
	// The emulator reports batch results under a key the SDK drops, so every entry would look unsent.
	if (client.isLocalEndpoint) {
		return sendEntriesOneByOne({ client, queueUrl, entries });
	}

	const failures: EntryFailure[] = [];
	for (
		let start = 0;
		start < entries.length;
		start += SEND_MESSAGE_BATCH_LIMIT
	) {
		const chunk = entries.slice(start, start + SEND_MESSAGE_BATCH_LIMIT);
		const output = await client.client.send(
			new SendMessageBatchCommand({
				QueueUrl: queueUrl,
				Entries: chunk.map((entry, index) => ({
					Id: String(start + index),
					MessageBody: entry.body,
					...toMessageFields({ entry }),
				})),
			}),
		);
		const succeeded = new Set(output.Successful?.map((result) => result.Id));
		const refused = new Map(
			output.Failed?.map((result) => [
				result.Id,
				result.Message ?? result.Code,
			]),
		);
		for (let index = 0; index < chunk.length; index++) {
			const id = String(start + index);
			if (succeeded.has(id)) continue;
			failures.push({
				index: start + index,
				reason: refused.get(id) ?? "Missing SQS batch result",
			});
		}
	}
	return failures;
};
