import { isDeepStrictEqual } from "node:util";
import { BALANCE_WORKER_DEFERRED_COMMIT_MS } from "@autumn/env/balanceWorkerConstants";
import type { MeteringRecord } from "@autumn/kafka";
import { timeSync } from "../../../logging/eventLoopStalls/syncSections.js";
import type {
	DurableMutationApplyResult,
	DurableMutationRecord,
} from "../../../state/types/durableMutation.js";
import type { SnapshotIntent } from "../../../state/types/snapshotIntent.js";
import type { ApplyWaits } from "../../../state/types/stateStore.js";
import {
	advanceStored,
	awaitStored,
	maxBatchBytesOf,
	maxBatchesPerFlushOf,
	maxUnappliedBatchesOf,
	rejectAllPending,
	releasePins,
	removePendingMutation,
	settlementOf,
	writerNowOf,
} from "../pendingMutations.js";
import type {
	CommitWaits,
	PartitionWriterScope,
	PendingMutation,
} from "../types/partitionWriter.js";
import {
	MutationBatchAppendError,
	MutationBatchNotCommittedError,
	PartitionWriterRecoveryRequiredError,
} from "../writerErrors.js";
import { decideSnapshotIntent } from "./decideSnapshotIntent.js";

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

export function scheduleDeferredCommit({
	scope,
}: {
	scope: PartitionWriterScope;
}): void {
	const { state, config } = scope;
	if (state.deferredCommitTimer || state.deferredCommitDue) return;
	if (state.recoveryError) return;
	function commitDeferredRecords(): void {
		state.deferredCommitTimer = null;
		if (state.deferredQueued === 0) return;
		state.deferredCommitDue = true;
		scheduleCommit({ scope });
	}
	state.deferredCommitTimer = setTimeout(
		commitDeferredRecords,
		config.limits.deferredCommitMs ?? BALANCE_WORKER_DEFERRED_COMMIT_MS,
	);
	state.deferredCommitTimer.unref?.();
}

export function flushDeferredLogs({
	scope,
}: {
	scope: PartitionWriterScope;
}): Promise<void> {
	const { state } = scope;
	const logs: Promise<void>[] = [];
	for (const pending of state.pendingByKey.values())
		if (pending.defersCommit) logs.push(settlementOf({ pending }).waitForLog());
	if (logs.length === 0) return Promise.resolve();
	if (state.deferredQueued > 0) {
		state.deferredCommitDue = true;
		scheduleCommit({ scope });
	}
	return Promise.all(logs).then(() => undefined);
}

function holdsOnlyDeferredRecords({
	state,
}: {
	state: PartitionWriterScope["state"];
}): boolean {
	return state.deferredQueued === state.queue.length;
}

function releaseDeferredRecords({
	state,
	batch,
}: {
	state: PartitionWriterScope["state"];
	batch: PendingMutation[];
}): void {
	for (const pending of batch)
		if (pending.defersCommit) state.deferredQueued -= 1;
	if (state.deferredQueued > 0) return;
	if (state.deferredCommitTimer) clearTimeout(state.deferredCommitTimer);
	state.deferredCommitTimer = null;
	state.deferredCommitDue = false;
}

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
			if (holdsOnlyDeferredRecords({ state }) && !state.deferredCommitDue) {
				scheduleDeferredCommit({ scope });
				return;
			}
			const storeWaitStartedAt = writerNowOf({ scope });
			while (
				state.unapplied.length >=
				maxUnappliedBatchesOf({ limits: config.limits })
			) {
				await awaitStored({
					state,
					seq: state.unapplied[0]?.batch.at(-1)?.seq ?? 0,
				}).catch(() => undefined);
				if (state.recoveryError) return;
			}
			const lingerStartedAt = writerNowOf({ scope });
			await lingerForBatch({ scope });
			if (state.recoveryError) return;
			const batch = takeBatch({ scope });
			const takenAt = writerNowOf({ scope });
			releaseDeferredRecords({ state, batch });
			state.lastBatchSize = batch.length;
			const baseOffset = await appendBatch({
				scope,
				batch,
				waits: {
					queuedMs: queuedMsOf({ batch, takenAt }),
					lingerMs: takenAt - lingerStartedAt,
					storeWaitMs: lingerStartedAt - storeWaitStartedAt,
				},
			});
			if (baseOffset === null || state.recoveryError) return;
			state.appendedThrough = baseOffset + BigInt(batch.length - 1);
			settleAppended({ scope, batch });
			queueApply({ scope, batch, baseOffset });
		}
	} finally {
		state.draining = false;
	}
}

async function lingerForBatch({
	scope,
}: {
	scope: PartitionWriterScope;
}): Promise<void> {
	const { state, config } = scope;
	const lingerMs = config.limits.commitLingerMs ?? 0;
	if (lingerMs <= 0 || state.lastBatchSize <= 1) return;
	if (state.queue.length >= config.limits.maxBatchSize) return;
	await new Promise<void>((resolve) => {
		let timer: ReturnType<typeof setTimeout> | undefined;
		function wake(): void {
			clearTimeout(timer);
			state.lingerWake = null;
			resolve();
		}
		state.lingerWake = wake;
		timer = setTimeout(wake, lingerMs);
	});
}

function queueApply({
	scope,
	batch,
	baseOffset,
}: {
	scope: PartitionWriterScope;
	batch: PendingMutation[];
	baseOffset: bigint;
}): void {
	const { state } = scope;
	state.unapplied.push({
		batch,
		baseOffset,
		committedAt: writerNowOf({ scope }),
	});
	if (applyIsDue({ scope })) state.applyWake?.();
	if (state.applying) return;
	state.applying = true;
	state.applyTail = applyQueued({ scope });
}

function applyIsDue({ scope }: { scope: PartitionWriterScope }): boolean {
	const { state, ctx, config } = scope;
	return (
		state.storeWaiters.length > 0 ||
		state.unapplied.length >=
			maxBatchesPerFlushOf({ ctx, limits: config.limits }) ||
		state.unapplied.some(({ batch }) =>
			batch.some((pending) => pending.durability === "store"),
		)
	);
}

function lingerForApply({
	scope,
}: {
	scope: PartitionWriterScope;
}): Promise<void> | null {
	const { state, config, ctx } = scope;
	const lingerMs =
		ctx.dbControl?.get().balanceCommitter.applyLingerMs ??
		config.limits.applyLingerMs ??
		0;
	if (lingerMs <= 0 || applyIsDue({ scope })) return null;
	return new Promise<void>((resolve) => {
		function wake(): void {
			clearTimeout(timer);
			state.applyWake = null;
			resolve();
		}
		const timer = setTimeout(wake, lingerMs);
		timer.unref?.();
		state.applyWake = wake;
	});
}

async function applyQueued({
	scope,
}: {
	scope: PartitionWriterScope;
}): Promise<void> {
	const { state, ctx, config } = scope;
	try {
		while (state.unapplied.length > 0 && !state.recoveryError) {
			const linger = lingerForApply({ scope });
			if (linger) await linger;
			if (state.recoveryError) return;
			const taken = state.unapplied.slice(
				0,
				maxBatchesPerFlushOf({ ctx, limits: config.limits }),
			);
			const takenAt = writerNowOf({ scope });
			const batch = taken.flatMap((entry) => entry.batch);
			const records = timeSync({ label: "writer.apply.build" }, () =>
				taken.flatMap((entry) =>
					durableRecordsOf({
						scope,
						batch: entry.batch,
						baseOffset: entry.baseOffset,
					}),
				),
			);
			const snapshotIntent = timeSync({ label: "writer.apply.intent" }, () =>
				decideSnapshotIntent({ scope, batch }),
			);
			const ok = await applyBatch({
				scope,
				batch,
				records,
				snapshotIntent,
				waits: { unappliedMs: takenAt - (taken[0]?.committedAt ?? takenAt) },
			});
			state.unapplied.splice(0, taken.length);
			if (!ok) return;
		}
	} finally {
		state.applying = false;
	}
}

async function appendBatch({
	scope,
	batch,
	waits,
}: {
	scope: PartitionWriterScope;
	batch: PendingMutation[];
	waits: CommitWaits;
}): Promise<bigint | null> {
	const { ctx, config, state } = scope;
	try {
		const appended = ctx.appender.appendCommitted({
			topic: config.topic,
			partition: config.partition,
			outcomes: batch.map(mutationOf),
			waits,
		});
		state.appending = appended.then(
			() => undefined,
			() => undefined,
		);
		const { baseOffset } = await appended;
		if (typeof baseOffset !== "bigint" || baseOffset < 0n) {
			throw new RangeError("Invalid appended Kafka offset");
		}
		return baseOffset;
	} catch (cause) {
		const provenUncommitted =
			cause instanceof MutationBatchNotCommittedError &&
			state.unapplied.length === 0;
		if (provenUncommitted && !holdsQueuedCommand({ state, batch })) {
			const error = new MutationBatchAppendError({ cause });
			rejectAllPending({ state, batch, error });
			failAboveSettled({ scope, cause: error });
			state.storeCompletion = Promise.resolve();
			state.lastRowSeq = state.storedSeq;
		} else {
			enterRecovery({ scope, batch, cause });
		}
		return null;
	}
}

function holdsQueuedCommand({
	state,
	batch,
}: {
	state: PartitionWriterScope["state"];
	batch: PendingMutation[];
}): boolean {
	return batch.some(isQueuedCommand) || state.queue.some(isQueuedCommand);
}

function isQueuedCommand(pending: PendingMutation): boolean {
	return pending.mutation.source !== undefined;
}

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
	const last = batch.at(-1);
	if (!last || last.seq <= scope.state.settledSeq) return;
	scope.state.settledSeq = last.seq;
	scope.ctx.commitPositions?.committed({ seq: last.seq });
}

export function failAboveSettled({
	scope,
	cause,
}: {
	scope: PartitionWriterScope;
	cause: unknown;
}): void {
	const { state } = scope;
	if (state.lastSeq <= state.settledSeq) return;
	scope.ctx.commitPositions?.failedAbove({
		seq: state.settledSeq,
		lastSeq: state.lastSeq,
		cause,
	});
	state.settledSeq = state.lastSeq;
}

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
	pending.settlement?.settle({ mutation, state: pending.nextState });
}

async function applyBatch({
	scope,
	batch,
	records,
	snapshotIntent,
	waits,
}: {
	scope: PartitionWriterScope;
	batch: PendingMutation[];
	records: DurableMutationRecord[];
	snapshotIntent: SnapshotIntent;
	waits: ApplyWaits;
}): Promise<boolean> {
	try {
		const results = await scope.ctx.stateStore.applyDurableMutations({
			records,
			snapshotIntent,
			waits,
		});
		if (results.length !== batch.length) {
			throw new Error("Durable apply result count did not match batch");
		}
		let firstFailure: unknown = null;
		for (const [index, pending] of batch.entries()) {
			const result = results[index];
			if (!result) throw new Error("Expected durable apply result");
			const waiting = pending.durability === "store";
			if (result.kind === "failed") {
				firstFailure ??= result.cause;
				if (waiting) removePendingMutation({ state: scope.state, pending });
				pending.settlement?.rejectCommit({ error: result.cause });
				continue;
			}
			if (result.kind === "rejected") {
				scope.state.subjects.evictCustomer({
					customerKey: pending.customerKey,
				});
				if (waiting) {
					removePendingMutation({ state: scope.state, pending });
					pending.settlement?.rejectCommit({ error: result.cause });
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
		for (const pending of batch) releasePins({ state: scope.state, pending });
		for (const pending of batch) pending.settlement?.settleStore();
		const last = batch.at(-1);
		if (last) advanceStored({ state: scope.state, seq: last.seq });
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
	const owed = new Set<PendingMutation>(batch);
	for (const unapplied of scope.state.unapplied)
		for (const pending of unapplied.batch) owed.add(pending);
	rejectAllPending({ state: scope.state, batch: [...owed], error });
	failAboveSettled({ scope, cause: error });
	scope.ctx.onRecoveryRequired?.({ cause: error });
}

function queuedMsOf({
	batch,
	takenAt,
}: {
	batch: PendingMutation[];
	takenAt: number;
}): number | null {
	const oldestAwaited = batch.find((pending) => !pending.defersCommit);
	return oldestAwaited ? takenAt - oldestAwaited.queuedAt : null;
}

function takeBatch({
	scope,
}: {
	scope: PartitionWriterScope;
}): PendingMutation[] {
	const { state, config } = scope;
	const maxBatchBytes = maxBatchBytesOf({ limits: config.limits });
	let count = 0;
	let bytes = 0;
	for (const pending of state.queue) {
		if (count >= config.limits.maxBatchSize) break;
		if (count > 0 && bytes + pending.encodedBytes > maxBatchBytes) break;
		bytes += pending.encodedBytes;
		count++;
	}
	return state.queue.splice(
		0,
		keepHeldGroupWhole({ queue: state.queue, count }),
	);
}

function keepHeldGroupWhole({
	queue,
	count,
}: {
	queue: PendingMutation[];
	count: number;
}): number {
	const group = queue[count - 1]?.heldGroup;
	if (group === undefined || queue[count]?.heldGroup !== group) return count;
	let start = count - 1;
	while (start > 0 && queue[start - 1]?.heldGroup === group) start--;
	if (start > 0) return start;
	let end = count;
	while (queue[end]?.heldGroup === group) end++;
	return end;
}

function mutationOf(pending: PendingMutation): MeteringRecord {
	return pending.loggedRecord;
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
