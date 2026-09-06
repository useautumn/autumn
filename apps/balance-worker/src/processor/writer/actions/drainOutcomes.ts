import { isDeepStrictEqual } from "node:util";
import type { MeteringRecord } from "@autumn/kafka";
import type {
	DurableMutationApplyResult,
	DurableMutationRecord,
} from "../../../state/sqliteBalanceStateStore.js";
import { rejectAllPending, removePendingOutcome } from "../pendingOutcomes.js";
import type {
	PartitionWriterScope,
	PendingOutcome,
} from "../types/partitionWriter.js";
import {
	MutationBatchAppendError,
	MutationBatchNotCommittedError,
	PartitionWriterRecoveryRequiredError,
} from "../writerErrors.js";

export function scheduleDrain({
	scope,
}: {
	scope: PartitionWriterScope;
}): void {
	const { state } = scope;
	if (state.drainScheduled || state.draining || state.recoveryError) return;
	state.drainScheduled = true;
	function runScheduledDrain(): void {
		state.drainScheduled = false;
		void drainOutcomes({ scope });
	}
	setImmediate(runScheduledDrain);
}

/** Kafka commit → SQLite apply → settle waiters, one batch at a time until the queue empties. */
async function drainOutcomes({
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
			if (!applyBatch({ scope, batch, baseOffset })) return;
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
	batch: PendingOutcome[];
}): Promise<bigint | null> {
	const { ctx, config, state } = scope;
	try {
		const { baseOffset } = await ctx.appender.appendCommitted({
			topic: config.topic,
			partition: config.partition,
			outcomes: batch.map(outcomeOf),
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

/** A committed batch that cannot be applied locally leaves the writer in recovery. */
function applyBatch({
	scope,
	batch,
	baseOffset,
}: {
	scope: PartitionWriterScope;
	batch: PendingOutcome[];
	baseOffset: bigint;
}): boolean {
	try {
		const records = durableRecordsOf({ scope, batch, baseOffset });
		const results = scope.ctx.stateStore.applyDurableMutations({ records });
		if (results.length !== batch.length) {
			throw new Error("Durable apply result count did not match batch");
		}
		for (const [index, pending] of batch.entries()) {
			const result = results[index];
			if (!result) throw new Error("Expected durable apply result");
			const outcome = persistedOutcomeOf({ scope, result, pending });
			removePendingOutcome({ state: scope.state, pending });
			pending.settlement.settle({ outcome });
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

function outcomeOf(pending: PendingOutcome): MeteringRecord {
	return pending.outcome;
}

function durableRecordsOf({
	scope,
	batch,
	baseOffset,
}: {
	scope: PartitionWriterScope;
	batch: PendingOutcome[];
	baseOffset: bigint;
}): DurableMutationRecord[] {
	const { topic, partition } = scope.config;
	const records: DurableMutationRecord[] = [];
	for (const [index, pending] of batch.entries()) {
		records.push({
			position: { topic, partition, offset: baseOffset + BigInt(index) },
			mutation: pending.outcome,
		});
	}
	return records;
}

/** The follower may apply a position first; then SQLite must hold exactly what we appended. */
function persistedOutcomeOf({
	scope,
	result,
	pending,
}: {
	scope: PartitionWriterScope;
	result: DurableMutationApplyResult;
	pending: PendingOutcome;
}): MeteringRecord {
	const { outcome } = pending;
	if (result.kind !== "position_already_applied") {
		return result.type === "track_outcome" ? result.receipt : outcome;
	}
	if (outcome.type === "state_initialized") {
		const state = scope.ctx.stateStore.readState({
			identity: outcome.state.identity,
		});
		if (!state) {
			throw new Error(
				`Applied position has no initialized state: ${outcome.initializationId}`,
			);
		}
		return outcome;
	}
	const receipt = scope.ctx.stateStore.readTrackReceipt({
		identity: outcome.identity,
		commandId: outcome.commandId,
	});
	if (!receipt || !isDeepStrictEqual(receipt, outcome)) {
		throw new Error(
			`Applied position has no matching receipt: ${outcome.commandId}`,
		);
	}
	return receipt;
}
