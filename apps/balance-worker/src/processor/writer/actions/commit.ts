import { isDeepStrictEqual } from "node:util";
import type { MeteringRecord } from "@autumn/kafka";
import type {
	DurableMutationApplyResult,
	DurableMutationRecord,
} from "../../../state/types/durableMutation.js";
import {
	rejectAllPending,
	removePendingMutation,
} from "../pendingMutations.js";
import type {
	PartitionWriterScope,
	PendingMutation,
} from "../types/partitionWriter.js";
import {
	MutationBatchAppendError,
	MutationBatchNotCommittedError,
	PartitionWriterRecoveryRequiredError,
} from "../writerErrors.js";

export function scheduleCommit({
	scope,
}: {
	scope: PartitionWriterScope;
}): void {
	const { state } = scope;
	if (state.drainScheduled || state.draining || state.recoveryError) return;
	state.drainScheduled = true;
	function runScheduledDrain(): void {
		state.drainScheduled = false;
		void commitOutcomes({ scope });
	}
	setImmediate(runScheduledDrain);
}

/** Kafka commit → store apply → settle waiters, one batch at a time until the queue empties. */
async function commitOutcomes({
	scope,
}: {
	scope: PartitionWriterScope;
}): Promise<void> {
	const { state, config } = scope;
	if (state.draining || state.recoveryError) return;
	state.draining = true;
	try {
		while (state.queue.length > 0 && !state.recoveryError) {
			const batch = state.queue.splice(0, config.limits.maxBatchSize);
			const baseOffset = await appendBatch({ scope, batch });
			if (baseOffset === null) return;
			settleAppended({ scope, batch });
			if (!(await applyBatch({ scope, batch, baseOffset }))) return;
		}
	} finally {
		state.draining = false;
	}
}

/** Returns null when draining must stop: proven no-commit rejects, anything else is recovery. */
async function appendBatch({
	scope,
	batch,
}: {
	scope: PartitionWriterScope;
	batch: PendingMutation[];
}): Promise<bigint | null> {
	const { ctx, config, state } = scope;
	try {
		const { baseOffset } = await ctx.appender.appendCommitted({
			topic: config.topic,
			partition: config.partition,
			outcomes: batch.map(mutationOf),
		});
		if (typeof baseOffset !== "bigint" || baseOffset < 0n) {
			throw new RangeError("Invalid appended Kafka offset");
		}
		return baseOffset;
	} catch (cause) {
		if (cause instanceof MutationBatchNotCommittedError) {
			rejectAllPending({
				state,
				batch,
				error: new MutationBatchAppendError({ cause }),
			});
			state.storeCompletion = Promise.resolve();
		} else {
			enterRecovery({ scope, batch, cause });
		}
		return null;
	}
}

/** The log is the record and the store is a projection of it, so once Kafka has
 *  the batch the outcome is durable and the caller can be answered. Everything the
 *  reply carries was decided in memory before either durability step: the balance
 *  is the state computed at decide time, and the store hands back the very mutation
 *  it was given. Waiting for the store therefore added its whole cost to every
 *  write without changing a byte of the response.
 *
 *  The writer still applies batches in order behind this; only the caller stops
 *  waiting. What is given up is the ability to tell a caller that the store later
 *  refused its row, which is why that refusal is logged where it happens. */
function settleAppended({
	scope,
	batch,
}: {
	scope: PartitionWriterScope;
	batch: PendingMutation[];
}): void {
	for (const pending of batch) {
		if (pending.durability !== "log") continue;
		settlePending({ scope, pending });
	}
}

/** Remember the command for dedup, unpin the subjects, answer the caller. */
function settlePending({
	scope,
	pending,
}: {
	scope: PartitionWriterScope;
	pending: PendingMutation;
}): void {
	const { mutation } = pending;
	scope.ctx.recentCommands.remember({ mutation });
	removePendingMutation({ state: scope.state, pending });
	pending.settlement.settle({ mutation, state: pending.nextState });
}

/** A committed batch that cannot be applied leaves the writer in recovery. */
async function applyBatch({
	scope,
	batch,
	baseOffset,
}: {
	scope: PartitionWriterScope;
	batch: PendingMutation[];
	baseOffset: bigint;
}): Promise<boolean> {
	try {
		const records = durableRecordsOf({ scope, batch, baseOffset });
		const results = await scope.ctx.stateStore.applyDurableMutations({
			records,
		});
		if (results.length !== batch.length) {
			throw new Error("Durable apply result count did not match batch");
		}
		// A "log" caller was answered when Kafka took the batch, so nothing here can
		// reach it and the store's verdict only decides the partition's fate. A
		// "store" caller is still waiting, and hears the verdict as it always did.
		let firstFailure: unknown = null;
		for (const [index, pending] of batch.entries()) {
			const result = results[index];
			if (!result) throw new Error("Expected durable apply result");
			const waiting = pending.durability === "store";
			if (result.kind === "failed") {
				firstFailure ??= result.cause;
				if (waiting) removePendingMutation({ state: scope.state, pending });
				pending.settlement.rejectCommit({ error: result.cause });
				continue;
			}
			// Refused by the store, not broken: the customer's rows are dropped because
			// memory had already applied a deduction that never landed there.
			if (result.kind === "rejected") {
				scope.state.subjects.evictCustomer({
					customerKey: pending.customerKey,
				});
				if (waiting) {
					removePendingMutation({ state: scope.state, pending });
					pending.settlement.rejectCommit({ error: result.cause });
				}
				continue;
			}
			assertPersistedMutation({ scope, result, pending });
			if (waiting) {
				settlePending({ scope, pending });
			}
		}
		if (firstFailure !== null) {
			enterRecovery({ scope, batch, cause: firstFailure });
			return false;
		}
		for (const pending of batch) pending.settlement.settleStore();
		return true;
	} catch (cause) {
		enterRecovery({ scope, batch, cause });
		return false;
	}
}

function enterRecovery({
	scope,
	batch,
	cause,
}: {
	scope: PartitionWriterScope;
	batch: PendingMutation[];
	cause: unknown;
}): void {
	const error = new PartitionWriterRecoveryRequiredError({ cause });
	scope.state.recoveryError = error;
	rejectAllPending({ state: scope.state, batch, error });
}

// Only the log's copy carries `after`; the record the store and the dedup memory keep stays lean.
function mutationOf(pending: PendingMutation): MeteringRecord {
	if (!pending.catalog) return pending.mutation;
	return {
		...pending.mutation,
		after: { state: pending.nextState, catalog: pending.catalog },
	};
}

function durableRecordsOf({
	scope,
	batch,
	baseOffset,
}: {
	scope: PartitionWriterScope;
	batch: PendingMutation[];
	baseOffset: bigint;
}): DurableMutationRecord[] {
	const { topic, partition } = scope.config;
	const records: DurableMutationRecord[] = [];
	for (const [index, pending] of batch.entries()) {
		records.push({
			position: { topic, partition, offset: baseOffset + BigInt(index) },
			mutation: pending.mutation,
		});
	}
	return records;
}

/** The follower may apply a position first; then the store has to say what we appended.
 *  A private SQLite store keeps a receipt per applied position, so it can prove the
 *  record coming back is the one already durable, and a mismatch is a real conflict
 *  worth stopping for.
 *
 *  The Postgres-backed store keeps no receipts at all. Its reads answer null on
 *  purpose, because Postgres holds the baseline rather than a file this worker owns,
 *  and its progress bookmark is the only evidence it has. That bookmark is what
 *  reported the position applied in the first place, so the pending mutation stands.
 *  Asking it for a receipt it was never built to store meant the first re-applied
 *  record put the partition into recovery, which stops the whole worker and every
 *  other partition it holds. */
function assertPersistedMutation({
	scope,
	result,
	pending,
}: {
	scope: PartitionWriterScope;
	result: DurableMutationApplyResult;
	pending: PendingMutation;
}): void {
	if (result.kind !== "position_already_applied") return;

	const { mutation } = pending;
	if (scope.ctx.stateStore.baseline === "map") return;

	const receipt = scope.ctx.stateStore.readReceipt({
		identity: mutation.identity,
		mutationId: mutation.id,
	});
	if (!receipt || !isDeepStrictEqual(receipt, mutation)) {
		throw new Error(`Applied position has no matching receipt: ${mutation.id}`);
	}
}
