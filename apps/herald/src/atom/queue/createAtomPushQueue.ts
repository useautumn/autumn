import type { QueueSendResult, RemoteQueue } from "@alienplatform/bindings";
import type { AutumnLogger } from "@autumn/logging";
import {
	createBatchAccumulator,
	type EntryFailure,
	type QueueBatchConfig,
} from "@autumn/sqs";
import type { AtomPushQueue } from "./types/atomPushQueue.js";

const PUSH_BATCH: QueueBatchConfig = {
	windowMs: 10,
	maxEntries: 10,
	maxBodyBytes: 256 * 1024,
};

const UNAVAILABLE_BACKOFF = { baseDelayMs: 1_000, maxDelayMs: 30_000 };

export class AtomQueueBackoffError extends Error {
	constructor({ retryInMs }: { retryInMs: number }) {
		super(`The Atom's queue failed its last send; next try in ${retryInMs}ms`);
		this.name = "AtomQueueBackoffError";
	}
}

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
