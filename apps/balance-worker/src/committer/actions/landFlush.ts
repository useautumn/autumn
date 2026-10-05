import { LockAlreadyExistsError } from "@autumn/balance-engine";
import {
	FlushBookmarkConflictError,
	isTransientPostgresError,
	PostgresSqlState,
	postgresSqlStateOf,
} from "@autumn/postgres";
import {
	SubjectNotFoundError,
	SubjectStaleError,
} from "../../processor/subject/subjectErrors.js";
import type { DurableMutationRecord } from "../../state/types/durableMutation.js";
import type { SnapshotIntent } from "../../state/types/snapshotIntent.js";
import {
	BillingPlanRowCollisionError,
	CommitterStoppedError,
	FlushRecordRefusedError,
	StaleSubjectRowsError,
} from "../committerErrors.js";
import type {
	CommitterContext,
	CommitterScope,
	Flush,
	FlushCall,
	FlushOutcome,
	FlushRejection,
} from "../types/committer.js";
import { flushLandedEarlier, runFlush } from "./runFlush.js";

/** Another writer moved this partition's bookmark: the record is fine, this worker no longer owns it. */
const isOwnershipLost = (cause: unknown): boolean =>
	cause instanceof FlushBookmarkConflictError;

/**
 * Why this record is skipped, or null when the failure is the store's or the partition's, not the record's own.
 * Anything else Postgres refuses would refuse the same way on every replay and hold the partition forever.
 */
const refusalOf = ({
	record,
	cause,
}: {
	record: DurableMutationRecord;
	cause: unknown;
}): Error | null => {
	if (isTransientPostgresError({ error: cause }) || isOwnershipLost(cause))
		return null;
	const { command, identity } = record.mutation;
	if (cause instanceof StaleSubjectRowsError)
		return new SubjectStaleError({ identity, cause });

	// A lock id is unique across the org but a writer knows only its own customers' locks, and a customer can be
	// deleted between the decision and the write: both are the request's problem, with an answer of their own.
	const sqlState = postgresSqlStateOf({ error: cause });
	if (
		command.type === "applyBillingPlan" &&
		sqlState === PostgresSqlState.UniqueViolation
	)
		return new BillingPlanRowCollisionError({ identity, cause });
	const lockId = command.type === "track" ? command.lock?.lockId : undefined;
	const isLockRow =
		lockId && cause instanceof Error && cause.message.includes("balance_locks");
	if (isLockRow && sqlState === PostgresSqlState.UniqueViolation)
		return new LockAlreadyExistsError({ lockId });
	if (isLockRow && sqlState === PostgresSqlState.ForeignKeyViolation)
		return new SubjectNotFoundError({ identity });
	return new FlushRecordRefusedError({ mutationId: record.mutation.id, cause });
};

/** A stale subject is routine (a concurrent writer); anything else skipped is a bug that lost a write. */
const reportRefusal = ({
	ctx,
	refusal,
}: {
	ctx: CommitterContext;
	refusal: Error;
}): void => {
	if (refusal instanceof BillingPlanRowCollisionError)
		ctx.logger?.error(`[committer] ${refusal.message}`);
	else if (refusal instanceof SubjectStaleError)
		ctx.logger?.warn(`[committer] ${refusal.message}`);
	if (refusal instanceof FlushRecordRefusedError)
		ctx.logger?.error(`[committer] ${refusal.message}`);
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

const defaultSleep = ({
	delayMs,
	signal,
}: {
	delayMs: number;
	signal: AbortSignal;
}): Promise<void> =>
	new Promise((resolve) => {
		const timer = setTimeout(finish, delayMs);
		function finish(): void {
			clearTimeout(timer);
			signal.removeEventListener("abort", finish);
			resolve();
		}
		signal.addEventListener("abort", finish, { once: true });
	});

/** Degraded is reported when the threshold is reached and again every threshold after, so a long outage stays visible. */
const reportStoreWaiting = ({
	scope,
	attempt,
	cause,
}: {
	scope: CommitterScope;
	attempt: number;
	cause: unknown;
}): void => {
	const { degradedAfterAttempts } = scope.config.retry;
	if (attempt % degradedAfterAttempts !== 0) return;
	scope.state.degraded = true;
	const reason = cause instanceof Error ? cause.message : String(cause);
	scope.ctx.logger?.warn(
		`[committer] Postgres has refused ${attempt} flush attempts and the committer is degraded; still retrying: ${reason}`,
	);
};

const reportStoreRecovered = ({
	scope,
	attempt,
}: {
	scope: CommitterScope;
	attempt: number;
}): void => {
	if (!scope.state.degraded) return;
	scope.state.degraded = false;
	scope.ctx.logger?.info(
		`[committer] Postgres accepted a flush after ${attempt} attempts; the committer is no longer degraded`,
	);
};

/** The same flush again while the failure is the store's, with capped backoff; a retry's conflict is checked against the stored bookmark first. */
const runWithRetries = async ({
	scope,
	flush,
}: {
	scope: CommitterScope;
	flush: Flush;
}): Promise<Map<FlushCall, FlushOutcome>> => {
	const { ctx, config } = scope;
	const { signal } = scope.state.stop;
	const sleep = ctx.sleep ?? defaultSleep;
	let delayMs = config.retry.initialBackoffMs;
	let attempted = flush;
	for (let attempt = 1; ; attempt++) {
		try {
			const outcomes = await runFlush({ ctx, config, flush: attempted });
			reportStoreRecovered({ scope, attempt });
			return keyedByOriginalCalls({ flush, attempted, outcomes });
		} catch (cause) {
			if (attempt > 1 && isOwnershipLost(cause)) {
				const landed = await flushLandedEarlier({ ctx, flush });
				if (landed) {
					ctx.logger?.info(
						`[committer] a flush landed on an earlier attempt whose answer was lost; attempt ${attempt} found its bookmark already moved`,
					);
					reportStoreRecovered({ scope, attempt });
					return landed;
				}
			}
			if (!isTransientPostgresError({ error: cause })) throw cause;
			// Two transient refusals of a snapshot-carrying flush: the snapshots may be the weight, so they go before the records wait longer.
			if (
				attempt === 2 &&
				attempted.calls.some((call) => writesSnapshots({ call }))
			) {
				attempted = withoutSnapshotWrites({ flush: attempted });
				ctx.logger?.warn(
					"[committer] a flush failed twice with its snapshots attached; retrying it with the customers' snapshots deleted instead",
				);
			}
			reportStoreWaiting({ scope, attempt, cause });
			await sleep({ delayMs, signal });
			if (signal.aborted) throw new CommitterStoppedError({ cause });
			delayMs = Math.min(delayMs * 4, config.retry.maxBackoffMs);
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
	// A record landing alone no longer lands with the rest of its customer's: its snapshot is deleted, not written.
	snapshotIntent: withSnapshotsDeleted({ intent: call.snapshotIntent }),
});

/** The same calls with every snapshot deleted instead of written; a call that wrote none is the same object. */
const withoutSnapshotWrites = ({ flush }: { flush: Flush }): Flush => ({
	calls: flush.calls.map((call) =>
		writesSnapshots({ call })
			? {
					...call,
					snapshotIntent: withSnapshotsDeleted({ intent: call.snapshotIntent }),
				}
			: call,
	),
});

/** Outcomes under the calls the caller handed in, when a retry ran stand-in calls for them. */
const keyedByOriginalCalls = ({
	flush,
	attempted,
	outcomes,
}: {
	flush: Flush;
	attempted: Flush;
	outcomes: Map<FlushCall, FlushOutcome>;
}): Map<FlushCall, FlushOutcome> => {
	if (attempted === flush) return outcomes;
	const keyed = new Map<FlushCall, FlushOutcome>();
	flush.calls.forEach((call, index) => {
		const outcome = outcomes.get(attempted.calls[index] ?? call);
		if (outcome) keyed.set(call, outcome);
	});
	return keyed;
};

/** The same intent with every customer's rows deleted instead of written. */
const withSnapshotsDeleted = ({
	intent,
}: {
	intent: SnapshotIntent | undefined;
}): SnapshotIntent | undefined =>
	intent && new Map([...intent.keys()].map((key) => [key, "delete" as const]));

const writesSnapshots = ({ call }: { call: FlushCall }): boolean =>
	[...(call.snapshotIntent?.values() ?? [])].some(
		(entry) => entry !== "delete",
	);

type RefusedRecord =
	| {
			nextOffset: bigint;
			commandNextOffset?: bigint;
			rejection: FlushRejection;
	  }
	| {
			nextOffset: bigint;
			failure: { record: DurableMutationRecord; cause: unknown };
	  };

/** A record that would not land alone: one the store refuses is skipped past with only its bookmark; a store or ownership failure stops the call here. */
const settleRefusedRecord = async ({
	scope,
	call,
	record,
	cause,
	nextOffset,
}: {
	scope: CommitterScope;
	call: FlushCall;
	record: DurableMutationRecord;
	cause: unknown;
	nextOffset: bigint;
}): Promise<RefusedRecord> => {
	const refusal = refusalOf({ record, cause });
	if (!refusal) return { nextOffset, failure: { record, cause } };
	reportRefusal({ ctx: scope.ctx, refusal });
	const skip = recordCall({
		call,
		record: withoutChanges({ record }),
		expectedOffset: nextOffset,
	});
	try {
		const outcomes = await runWithRetries({
			scope,
			flush: { calls: [skip] },
		});
		return {
			nextOffset: outcomes.get(skip)?.nextOffset ?? nextOffset,
			commandNextOffset: outcomes.get(skip)?.commandNextOffset,
			rejection: { record, cause: refusal },
		};
	} catch (skipCause) {
		return { nextOffset, failure: { record, cause: skipCause } };
	}
};

/** One call, one record at a time and in order: the bookmark stops at the first record that is broken, and moves past one that is merely refused. */
const landRecordsOneByOne = async ({
	scope,
	call,
}: {
	scope: CommitterScope;
	call: FlushCall;
}): Promise<FlushOutcome> => {
	let nextOffset = call.expectedOffset;
	let commandNextOffset: bigint | undefined;
	const rejections: FlushRejection[] = [];
	for (const record of call.records) {
		const single = recordCall({ call, record, expectedOffset: nextOffset });
		try {
			const outcomes = await runWithRetries({
				scope,
				flush: { calls: [single] },
			});
			nextOffset = outcomes.get(single)?.nextOffset ?? nextOffset;
			commandNextOffset =
				outcomes.get(single)?.commandNextOffset ?? commandNextOffset;
		} catch (cause) {
			const refused = await settleRefusedRecord({
				scope,
				call,
				record,
				cause,
				nextOffset,
			});
			nextOffset = refused.nextOffset;
			if ("failure" in refused)
				return {
					nextOffset,
					commandNextOffset,
					failure: refused.failure,
					rejections,
				};
			commandNextOffset = refused.commandNextOffset ?? commandNextOffset;
			rejections.push(refused.rejection);
		}
	}
	return { nextOffset, commandNextOffset, rejections };
};

/**
 * Lands a flush, then shrinks around whatever refuses to land: retry while transient, then each
 * call alone, then each record alone. Every call gets an outcome; only the bad record is left behind.
 */
export const landFlush = async ({
	scope,
	flush,
}: {
	scope: CommitterScope;
	flush: Flush;
}): Promise<Map<FlushCall, FlushOutcome>> => {
	const { ctx } = scope;
	try {
		return await runWithRetries({ scope, flush });
	} catch (cause) {
		if (cause instanceof CommitterStoppedError) throw cause;
		const outcomes = new Map<FlushCall, FlushOutcome>();
		const recordCount = flush.calls.reduce(
			(total, call) => total + call.records.length,
			0,
		);
		// Landing piece by piece costs a transaction per record, so it must never happen quietly.
		if (recordCount > 1)
			ctx.logger?.warn(
				`[committer] flush of ${recordCount} records failed and is landing piece by piece: ${cause instanceof Error ? cause.message : String(cause)}`,
			);
		if (flush.calls.length > 1) {
			for (const call of flush.calls) {
				const alone = await landFlush({ scope, flush: { calls: [call] } });
				for (const [landed, outcome] of alone) outcomes.set(landed, outcome);
			}
			return outcomes;
		}
		const call = flush.calls[0];
		if (!call) return outcomes;
		if (call.records.length > 1) {
			outcomes.set(call, await landRecordsOneByOne({ scope, call }));
			return outcomes;
		}
		// A lone record already failed alone: it is not re-run, only classified,
		// unless its snapshot could be the reason, which must never cost a record.
		const record = call.records[0];
		if (!record) {
			throw cause;
		}
		if (writesSnapshots({ call })) {
			const deleted = {
				...call,
				snapshotIntent: withSnapshotsDeleted({ intent: call.snapshotIntent }),
			};
			const landed = await landFlush({ scope, flush: { calls: [deleted] } });
			const outcome = landed.get(deleted);
			if (outcome) outcomes.set(call, outcome);
			return outcomes;
		}
		const refused = await settleRefusedRecord({
			scope,
			call,
			record,
			cause,
			nextOffset: call.expectedOffset,
		});
		outcomes.set(
			call,
			"failure" in refused
				? { nextOffset: refused.nextOffset, failure: refused.failure }
				: {
						nextOffset: refused.nextOffset,
						commandNextOffset: refused.commandNextOffset,
						rejections: [refused.rejection],
					},
		);
		return outcomes;
	}
};
