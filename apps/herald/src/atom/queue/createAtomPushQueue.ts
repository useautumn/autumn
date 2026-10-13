import type { QueueSendResult, RemoteQueue } from "@alienplatform/bindings";
import type { AutumnLogger } from "@autumn/logging";
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

/** After a whole batch fails, the queue is tried again in 1 s, doubling to 30 s; Alien is not asked in between. */
const UNAVAILABLE_BACKOFF = { baseDelayMs: 1_000, maxDelayMs: 30_000 };

/** A push refused without asking Alien, because the queue's last attempt failed; its warning already covers it. */
export class AtomQueueBackoffError extends Error {
	constructor({ retryInMs }: { retryInMs: number }) {
		super(`The Atom's queue failed its last send; next try in ${retryInMs}ms`);
		this.name = "AtomQueueBackoffError";
	}
}

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

/** An opened queue is kept for good, though alien still re-mints its credentials as they expire; a failed open or send waits out the backoff. */
export const createAtomPushQueue = ({
	openQueue,
	logger,
}: {
	openQueue: () => Promise<Pick<RemoteQueue, "sendBatchText">>;
	logger: Pick<AutumnLogger, "warn" | "info">;
}): AtomPushQueue => {
	let opened: Promise<Pick<RemoteQueue, "sendBatchText">> | null = null;
	const queue = () => {
		opened ??= openQueue().catch((error) => {
			opened = null;
			throw error;
		});
		return opened;
	};

	let failures = 0;
	let retryAtMs = 0;
	let failedFast = 0;

	const recordFailure = ({ error }: { error: unknown }) => {
		// Batches already in flight fail with the same cause; only the first one moves the backoff.
		if (Date.now() < retryAtMs) return;
		failures += 1;
		const retryInMs = Math.min(
			UNAVAILABLE_BACKOFF.baseDelayMs * 2 ** (failures - 1),
			UNAVAILABLE_BACKOFF.maxDelayMs,
		);
		retryAtMs = Date.now() + retryInMs;
		logger.warn(
			{
				error,
				type: "herald_atom_queue_unavailable",
				data: { failures, retryInMs, failedFast },
			},
			"The Atom's queue failed a send; pushes fail at once until the next try",
		);
		failedFast = 0;
	};

	const recordSuccess = () => {
		if (failures === 0) return;
		logger.info(
			{
				type: "herald_atom_queue_recovered",
				data: { failures, failedFast },
			},
			"The Atom's queue took a send again",
		);
		failures = 0;
		failedFast = 0;
	};

	const sendBatch = async (bodies: string[]): Promise<EntryFailure[]> => {
		const retryInMs = retryAtMs - Date.now();
		if (retryInMs > 0) {
			failedFast += bodies.length;
			throw new AtomQueueBackoffError({ retryInMs });
		}
		try {
			const results = await (await queue()).sendBatchText(bodies);
			recordSuccess();
			return resultsToFailures({ results });
		} catch (error) {
			recordFailure({ error });
			throw error;
		}
	};

	const accumulator = createBatchAccumulator({
		config: PUSH_BATCH,
		sendBatch: (entries) => sendBatch(entries.map((entry) => entry.body)),
		onRejectedDuringShutdown: () => {},
	});
	return { send: ({ payload }) => accumulator.enqueue({ body: payload }) };
};
