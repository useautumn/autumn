import type { DurableMutationRecord } from "../../state/types/durableMutation.js";
import type {
	CommitterContext,
	Flush,
	FlushCall,
	FlushOutcome,
	FlushRetryPolicy,
} from "../types/committer.js";
import { runFlush } from "./runFlush.js";

/** SQLSTATE classes worth a retry: the connection, a concurrency abort, a cancelled statement, a full pool. */
const TRANSIENT_SQLSTATE = /^(08|40001|40P01|57014|53300|57P0[123])/;
const TRANSIENT_SOCKET_CODES = new Set([
	"ECONNRESET",
	"ECONNREFUSED",
	"EPIPE",
	"ETIMEDOUT",
]);

const isTransientFailure = (cause: unknown): boolean => {
	if (!(cause instanceof Error)) return false;
	const { errno, code } = cause as Error & { errno?: unknown; code?: unknown };
	if (typeof errno === "string" && TRANSIENT_SQLSTATE.test(errno)) return true;
	return typeof code === "string" && TRANSIENT_SOCKET_CODES.has(code);
};

const defaultSleep = ({ delayMs }: { delayMs: number }) => Bun.sleep(delayMs);

/** The same flush again while the failure looks transient, with exponential backoff, at most `maxAttempts` times. */
const runWithRetries = async ({
	ctx,
	flush,
	retry,
}: {
	ctx: CommitterContext;
	flush: Flush;
	retry: FlushRetryPolicy;
}): Promise<Map<FlushCall, FlushOutcome>> => {
	const sleep = ctx.sleep ?? defaultSleep;
	let delayMs = retry.initialBackoffMs;
	for (let attempt = 1; ; attempt++) {
		try {
			return await runFlush({ ctx, flush });
		} catch (cause) {
			if (attempt >= retry.maxAttempts || !isTransientFailure(cause))
				throw cause;
			await sleep({ delayMs });
			delayMs = Math.min(delayMs * 4, retry.maxBackoffMs);
		}
	}
};

const recordCall = ({
	call,
	record,
	expectedOffset,
}: {
	call: FlushCall;
	record: DurableMutationRecord;
	expectedOffset: bigint;
}): FlushCall => ({
	...call,
	expectedOffset,
	records: [record],
	rows: record.mutation.changes.length,
});

/** One call, one record at a time and in order: the bookmark stops at the first record that will not land. */
const landRecordsOneByOne = async ({
	ctx,
	call,
	retry,
}: {
	ctx: CommitterContext;
	call: FlushCall;
	retry: FlushRetryPolicy;
}): Promise<FlushOutcome> => {
	let nextOffset = call.expectedOffset;
	for (const record of call.records) {
		const single = recordCall({ call, record, expectedOffset: nextOffset });
		try {
			const outcomes = await runWithRetries({
				ctx,
				flush: { calls: [single] },
				retry,
			});
			nextOffset = outcomes.get(single)?.nextOffset ?? nextOffset;
		} catch (cause) {
			return { nextOffset, failure: { record, cause } };
		}
	}
	return { nextOffset };
};

/**
 * Lands a flush, then shrinks around whatever refuses to land: retry while transient, then each
 * call alone, then each record alone. Every call gets an outcome; only the bad record is left behind.
 */
export const landFlush = async ({
	ctx,
	flush,
	retry,
}: {
	ctx: CommitterContext;
	flush: Flush;
	retry: FlushRetryPolicy;
}): Promise<Map<FlushCall, FlushOutcome>> => {
	try {
		return await runWithRetries({ ctx, flush, retry });
	} catch (cause) {
		const outcomes = new Map<FlushCall, FlushOutcome>();
		if (flush.calls.length > 1) {
			for (const call of flush.calls) {
				const alone = await landFlush({ ctx, flush: { calls: [call] }, retry });
				for (const [landed, outcome] of alone) outcomes.set(landed, outcome);
			}
			return outcomes;
		}
		const call = flush.calls[0];
		if (!call) return outcomes;
		if (call.records.length > 1) {
			outcomes.set(call, await landRecordsOneByOne({ ctx, call, retry }));
			return outcomes;
		}
		const record = call.records[0];
		outcomes.set(
			call,
			record
				? { nextOffset: call.expectedOffset, failure: { record, cause } }
				: { nextOffset: call.expectedOffset },
		);
		return outcomes;
	}
};
