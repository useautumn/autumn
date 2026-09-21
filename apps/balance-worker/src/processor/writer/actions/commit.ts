import { isDeepStrictEqual } from "node:util";
import type { MutationRecord } from "@autumn/balance-engine";
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
				error: new MutationBatchAppendError({ cause }),
			});
		} else {
			enterRecovery({ scope, cause });
		}
		return null;
	}
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
		// Landed records reply before anything else: their callers must never see a failure that was not theirs.
		let firstFailure: unknown = null;
		for (const [index, pending] of batch.entries()) {
			const result = results[index];
			if (!result) throw new Error("Expected durable apply result");
			if (result.kind === "failed") {
				firstFailure ??= result.cause;
				removePendingMutation({ state: scope.state, pending });
				pending.settlement.reject({ error: result.cause });
				continue;
			}
			// Refused by Postgres, not broken: only this caller hears of it, and the customer's rows are
			// dropped because memory had already applied a deduction that never landed.
			if (result.kind === "rejected") {
				removePendingMutation({ state: scope.state, pending });
				scope.state.subjects.evictCustomer({
					customerKey: pending.customerKey,
				});
				pending.settlement.reject({ error: result.cause });
				continue;
			}
			const mutation = persistedMutationOf({ scope, result, pending });
			scope.state.subjects.rememberCommand({
				customerKey: pending.customerKey,
				commandId: mutation.id,
				fingerprint: mutation.receipt.fingerprint,
				expiresAt: mutation.receipt.expiresAt,
			});
			removePendingMutation({ state: scope.state, pending });
			pending.settlement.settle({
				mutation,
				state: pending.nextState,
			});
		}
		if (firstFailure !== null) {
			enterRecovery({ scope, cause: firstFailure });
			return false;
		}
		return true;
	} catch (cause) {
		enterRecovery({ scope, cause });
		return false;
	}
}

function enterRecovery({
	scope,
	cause,
}: {
	scope: PartitionWriterScope;
	cause: unknown;
}): void {
	const error = new PartitionWriterRecoveryRequiredError({ cause });
	scope.state.recoveryError = error;
	rejectAllPending({ state: scope.state, error });
}

function mutationOf(pending: PendingMutation): MeteringRecord {
	return pending.mutation;
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

/** The follower may apply a position first; then SQLite must hold exactly what we appended. */
function persistedMutationOf({
	scope,
	result,
	pending,
}: {
	scope: PartitionWriterScope;
	result: DurableMutationApplyResult;
	pending: PendingMutation;
}): MutationRecord {
	if (result.kind !== "position_already_applied") return result.mutation;

	const { mutation } = pending;
	const receipt = scope.ctx.stateStore.readReceipt({
		identity: mutation.identity,
		mutationId: mutation.id,
	});
	if (!receipt || !isDeepStrictEqual(receipt, mutation)) {
		throw new Error(`Applied position has no matching receipt: ${mutation.id}`);
	}
	return receipt;
}
