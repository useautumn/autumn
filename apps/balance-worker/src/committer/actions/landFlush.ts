import { LockAlreadyExistsError } from "@autumn/balance-engine";
import type { DurableMutationRecord } from "../../state/types/durableMutation.js";
import type {
	CommitterContext,
	Flush,
	FlushCall,
	FlushOutcome,
	FlushRejection,
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

const UNIQUE_VIOLATION = "23505";

/**
 * The lock id is unique across the org, but only one customer's locks are in a writer's memory: another
 * customer holding the id is found here. That is the caller's mistake, not a broken record.
 */
const lockConflictOf = ({
	record,
	cause,
}: {
	record: DurableMutationRecord;
	cause: unknown;
}): LockAlreadyExistsError | null => {
	const { command } = record.mutation;
	const lockId = command.type === "track" ? command.lock?.lockId : undefined;
	if (!lockId || !(cause instanceof Error)) return null;
	const { errno } = cause as Error & { errno?: unknown };
	const isLockIdTaken =
		errno === UNIQUE_VIOLATION && cause.message.includes("balance_locks");
	return isLockIdTaken ? new LockAlreadyExistsError({ lockId }) : null;
};

/** The same record with nothing to write: lands only its bookmark, so the records behind it are not held up. */
const withoutChanges = ({
	record,
}: {
	record: DurableMutationRecord;
}): DurableMutationRecord => ({
	...record,
	mutation: { ...record.mutation, changes: [] },
});

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

type RefusedRecord =
	| { nextOffset: bigint; rejection: FlushRejection }
	| {
			nextOffset: bigint;
			failure: { record: DurableMutationRecord; cause: unknown };
	  };

/** A record that would not land alone: a lock conflict is skipped past with only its bookmark, anything else stops the call here. */
const settleRefusedRecord = async ({
	ctx,
	call,
	record,
	cause,
	retry,
	nextOffset,
}: {
	ctx: CommitterContext;
	call: FlushCall;
	record: DurableMutationRecord;
	cause: unknown;
	retry: FlushRetryPolicy;
	nextOffset: bigint;
}): Promise<RefusedRecord> => {
	const conflict = lockConflictOf({ record, cause });
	if (!conflict) return { nextOffset, failure: { record, cause } };
	const skip = recordCall({
		call,
		record: withoutChanges({ record }),
		expectedOffset: nextOffset,
	});
	try {
		const outcomes = await runWithRetries({
			ctx,
			flush: { calls: [skip] },
			retry,
		});
		return {
			nextOffset: outcomes.get(skip)?.nextOffset ?? nextOffset,
			rejection: { record, cause: conflict },
		};
	} catch (skipCause) {
		return { nextOffset, failure: { record, cause: skipCause } };
	}
};

/** One call, one record at a time and in order: the bookmark stops at the first record that is broken, and moves past one that is merely refused. */
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
	const rejections: FlushRejection[] = [];
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
			const refused = await settleRefusedRecord({
				ctx,
				call,
				record,
				cause,
				retry,
				nextOffset,
			});
			nextOffset = refused.nextOffset;
			if ("failure" in refused)
				return { nextOffset, failure: refused.failure, rejections };
			rejections.push(refused.rejection);
		}
	}
	return { nextOffset, rejections };
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
		// A lone record already failed alone: it is not re-run, only classified.
		const record = call.records[0];
		if (!record) {
			outcomes.set(call, { nextOffset: call.expectedOffset });
			return outcomes;
		}
		const refused = await settleRefusedRecord({
			ctx,
			call,
			record,
			cause,
			retry,
			nextOffset: call.expectedOffset,
		});
		outcomes.set(
			call,
			"failure" in refused
				? { nextOffset: refused.nextOffset, failure: refused.failure }
				: { nextOffset: refused.nextOffset, rejections: [refused.rejection] },
		);
		return outcomes;
	}
};
