import type { QueueSendResult, RemoteQueue } from "@alienplatform/bindings";
import {
	createBatchAccumulator,
	type EntryFailure,
	type QueueBatchConfig,
} from "@autumn/sqs";
import type { AtomPushQueue } from "./types/atomPushQueue.js";

/** SendMessageBatch's limits; a push waits at most 10 ms for company. */
const PUSH_BATCH: QueueBatchConfig = {
	windowMs: 10,
	maxEntries: 10,
	maxBodyBytes: 256 * 1024,
};

/** `unknown` may have been delivered: the push still fails, and the Atom's newer-read guard makes a later copy harmless. */
const resultsToFailures = ({
	results,
}: {
	results: QueueSendResult[];
}): EntryFailure[] =>
	results.flatMap((result, index) =>
		result.status === "sent"
			? []
			: [
					{
						index,
						reason: `${result.status} ${result.code}: ${result.message}`,
					},
				],
	);

/** Opening the queue resolves the deployment through alien once; a failed open is retried by the next send. */
export const createAtomPushQueue = ({
	openQueue,
}: {
	openQueue: () => Promise<Pick<RemoteQueue, "sendBatchText">>;
}): AtomPushQueue => {
	let opened: Promise<Pick<RemoteQueue, "sendBatchText">> | null = null;
	const queue = () => {
		opened ??= openQueue().catch((error) => {
			opened = null;
			throw error;
		});
		return opened;
	};
	const accumulator = createBatchAccumulator({
		config: PUSH_BATCH,
		sendBatch: async (entries) =>
			resultsToFailures({
				results: await (await queue()).sendBatchText(
					entries.map((entry) => entry.body),
				),
			}),
		onRejectedDuringShutdown: () => {},
	});
	return { send: ({ payload }) => accumulator.enqueue({ body: payload }) };
};
