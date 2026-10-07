import { appendCommandRecords } from "./appendCommandRecords.js";
import type {
	CommandAppend,
	CommandPublisher,
	CommandPublisherContext,
} from "./types/commandPublisher.js";

/** Commands are ~0.6 KB; this keeps a coalesced send well inside the broker's 1 MB message limit. */
const MAX_RECORDS_PER_SEND = 500;

type WaitingAppend = CommandAppend & {
	resolve: () => void;
	reject: (cause: unknown) => void;
};

/** The idempotent producer has one request in flight per broker, so appends that arrive during a send
 *  go out together in the next one instead of queueing one request each behind it. */
export function createCommandPublisher({
	ctx,
}: {
	ctx: CommandPublisherContext;
}): CommandPublisher {
	const waiting: WaitingAppend[] = [];
	let sending = false;

	function takeNextSend(): WaitingAppend[] {
		const batch: WaitingAppend[] = [];
		let records = 0;
		for (let next = waiting[0]; next; next = waiting[0]) {
			const full = records + next.records.length > MAX_RECORDS_PER_SEND;
			if (batch.length > 0 && full) break;
			batch.push(next);
			records += next.records.length;
			waiting.shift();
		}
		return batch;
	}

	async function sendBatch(batch: WaitingAppend[]): Promise<void> {
		const records: CommandAppend["records"][number][] = [];
		for (const append of batch) records.push(...append.records);
		try {
			await appendCommandRecords({ ctx, records });
		} catch (cause) {
			for (const append of batch) append.reject(cause);
			return;
		}
		for (const append of batch) append.resolve();
	}

	async function drain(): Promise<void> {
		sending = true;
		try {
			for (let batch = takeNextSend(); batch.length > 0; ) {
				await sendBatch(batch);
				batch = takeNextSend();
			}
		} finally {
			sending = false;
		}
	}

	function append(params: CommandAppend): Promise<void> {
		if (params.records.length === 0)
			return Promise.reject(
				new RangeError("Command record batch cannot be empty"),
			);
		const { promise, resolve, reject } = Promise.withResolvers<void>();
		waiting.push({ records: params.records, resolve, reject });
		if (!sending) void drain();
		return promise;
	}

	return { append };
}
