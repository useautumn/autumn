import { isDeepStrictEqual } from "node:util";
import { BALANCE_WORKER_DEFERRED_COMMIT_MS } from "@autumn/env/balanceWorkerConstants";
import type { MeteringRecord } from "@autumn/kafka";
import { commitPipelineArm } from "../../../experiments/commitPipeline.js";
import { timeSync } from "../../../logging/eventLoopStalls/syncSections.js";
import type {
	DurableMutationApplyResult,
	DurableMutationRecord,
} from "../../../state/types/durableMutation.js";
import {
	hurryApply,
	maxBatchBytesOf,
	maxUnappliedBatchesOf,
	rejectAllPending,
	removePendingMutation,
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

/** Bounds one store flush; the committer writes a flush as a single statement. */
const MAX_BATCHES_PER_FLUSH = 16;
/** Arm B: a busy partition commits at most once per interval, so commits/s stays bounded whatever arrives. */
export const ADAPTIVE_COMMIT_INTERVAL_MS = 25;
/** Arm C: at most ten store flushes a second per partition while nobody waits on the store. */
export const COALESCED_APPLY_INTERVAL_MS = 100;

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
		if (pending.defersCommit) logs.push(pending.settlement.waitForLog());
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

/** Kafka commit → answer log callers → hand the batch to the store, then straight
 *  on to the next batch. The store applies behind the log in order; the loop only
 *  waits for it when too many batches are still unapplied. */
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
				hurryApply({ state });
				await state.unapplied[0]?.batch[0]?.settlement
					.waitForStore()
					.catch(() => undefined);
				if (state.recoveryError) return;
			}
			const lingerStartedAt = writerNowOf({ scope });
			await lingerForBatch({ scope });
			if (state.recoveryError) return;
			const batch = takeBatch({ scope });
			const takenAt = writerNowOf({ scope });
			releaseDeferredRecords({ state, batch });
			state.lastBatchSize = batch.length;
			state.lastCommitStartedAt = takenAt;
			const baseOffset = await appendBatch({
				scope,
				batch,
				waits: {
					queuedMs: queuedMsOf({ batch, takenAt }),
					lingerMs: takenAt - lingerStartedAt,
					storeWaitMs: lingerStartedAt - storeWaitStartedAt,
				},
			});
			if (baseOffset === null) return;
			settleAppended({ scope, batch });
			queueApply({ scope, batch, baseOffset });
		}
	} finally {
		state.draining = false;
	}
}

/**
 * Waits for more of the queue before the next commit, but only where it pays.
 * A commit is three broker round trips whatever it carries, and on a busy
 * partition the commits arrive back to back with one or two records each: the
 * partition's throughput is then bounded by commits per second, and every track
 * waits behind that stream. A short linger lets a busy partition carry several
 * tracks per commit instead. A quiet partition, where the last batch held one
 * record, never waits: a linger there gathers nothing and costs every track
 * its length. A full batch ends the wait early.
 */
async function lingerForBatch({
	scope,
}: {
	scope: PartitionWriterScope;
}): Promise<void> {
	const { state, config } = scope;
	const lingerMs =
		commitPipelineArm() === "B"
			? adaptiveLingerMsOf({ scope })
			: fixedLingerMsOf({ scope });
	if (lingerMs <= 0) return;
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

function fixedLingerMsOf({ scope }: { scope: PartitionWriterScope }): number {
	const lingerMs = scope.config.limits.commitLingerMs ?? 0;
	return scope.state.lastBatchSize <= 1 ? 0 : lingerMs;
}

/** Whatever is left of the interval since the last commit began: nothing for a quiet partition, up to the interval for a busy one. */
function adaptiveLingerMsOf({
	scope,
}: {
	scope: PartitionWriterScope;
}): number {
	const since = writerNowOf({ scope }) - scope.state.lastCommitStartedAt;
	return Math.max(0, ADAPTIVE_COMMIT_INTERVAL_MS - since);
}

/** Hands a committed batch to the store. One flush runs at a time, and each takes
 *  every batch queued behind the one before it, because a flush costs about the same
 *  for one row as for hundreds. Order is the log's: batches join the queue in commit
 *  order and a flush applies them in that order. */
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
	state.unapplied.push({ batch, baseOffset });
	if (batch.some((pending) => pending.durability === "store"))
		hurryApply({ state });
	if (state.applying) return;
	state.applying = true;
	state.applyTail = applyQueued({ scope });
}

async function applyQueued({
	scope,
}: {
	scope: PartitionWriterScope;
}): Promise<void> {
	const { state } = scope;
	try {
		while (state.unapplied.length > 0 && !state.recoveryError) {
			await holdForCoalescing({ scope });
			if (state.recoveryError) return;
			state.applyHurried = false;
			state.lastApplyStartedAt = writerNowOf({ scope });
			const taken = state.unapplied.slice(0, MAX_BATCHES_PER_FLUSH);
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
			const ok = await applyBatch({ scope, batch, records });
			state.unapplied.splice(0, taken.length);
			if (!ok) return;
		}
	} finally {
		state.applying = false;
	}
}

/** Arm C: a flush waits out the interval since the last one began, unless someone waits on the store or it is full. */
async function holdForCoalescing({
	scope,
}: {
	scope: PartitionWriterScope;
}): Promise<void> {
	const { state } = scope;
	if (commitPipelineArm() !== "C") return;
	if (state.applyHurried) return;
	if (state.unapplied.length >= MAX_BATCHES_PER_FLUSH) return;
	const holdMs =
		COALESCED_APPLY_INTERVAL_MS -
		(writerNowOf({ scope }) - state.lastApplyStartedAt);
	if (holdMs <= 0) return;
	await new Promise<void>((resolve) => {
		const timer = setTimeout(wake, holdMs);
		function wake(): void {
			clearTimeout(timer);
			state.applyWake = null;
			resolve();
		}
		state.applyWake = wake;
	});
}

/** Returns null when draining must stop: proven no-commit rejects, anything else is recovery. */
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
		const { baseOffset } = await ctx.appender.appendCommitted({
			topic: config.topic,
			partition: config.partition,
			outcomes: batch.map(mutationOf),
			waits,
		});
		if (typeof baseOffset !== "bigint" || baseOffset < 0n) {
			throw new RangeError("Invalid appended Kafka offset");
		}
		return baseOffset;
	} catch (cause) {
		// Clearing speculative state is only safe when every committed batch is
		// already in the store; otherwise memory holds rows the store lacks, so the
		// partition rebuilds from the log instead.
		const provenUncommitted =
			cause instanceof MutationBatchNotCommittedError &&
			state.unapplied.length === 0;
		if (provenUncommitted && !holdsQueuedCommand({ state, batch })) {
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

/** A queued command that missed the log is a gap in the command stream: carrying on would let a
 *  later command commit past it, and the bookmark move over a command that never happened. */
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
	records,
}: {
	scope: PartitionWriterScope;
	batch: PendingMutation[];
	records: DurableMutationRecord[];
}): Promise<boolean> {
	try {
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

/** Every committed-but-unapplied batch still owns a store milestone, so recovery
 *  rejects those along with whatever never reached Kafka. */
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
	scope.state.applyWake?.();
	const owed = new Set<PendingMutation>(batch);
	for (const unapplied of scope.state.unapplied)
		for (const pending of unapplied.batch) owed.add(pending);
	rejectAllPending({ state: scope.state, batch: [...owed], error });
}

// Only the log's copy carries the effects; the store, its receipts and checkpoints hold the record without them.
/** Up to maxBatchSize records and maxBatchBytes, and never empty: enqueue already
 *  refused any single record over the byte limit. */
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
	return state.queue.splice(0, count);
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
