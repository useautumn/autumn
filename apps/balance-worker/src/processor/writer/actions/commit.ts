import { isDeepStrictEqual } from "node:util";
import { BALANCE_WORKER_DEFERRED_COMMIT_MS } from "@autumn/env/balanceWorkerConstants";
import type { MeteringRecord } from "@autumn/kafka";
import { skipsIdleLinger } from "../../../experiments/adaptiveLinger.js";
import { commitPipelineDepthOf } from "../../../experiments/commitDepth.js";
import { commitPipelineArm } from "../../../experiments/commitPipeline.js";
import { timeSync } from "../../../logging/eventLoopStalls/syncSections.js";
import type {
	DurableMutationApplyResult,
	DurableMutationRecord,
} from "../../../state/types/durableMutation.js";
import {
	advanceStored,
	hurryApply,
	maxBatchBytesOf,
	maxUnappliedBatchesOf,
	rejectAllPending,
	removePendingMutation,
	settlementOf,
	writerNowOf,
} from "../pendingMutations.js";
import type {
	AppendOutcome,
	CommitWaits,
	InFlightAppend,
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

/** Kafka commit → answer log callers → hand the batch to the store, then straight
 *  on to the next batch. The store applies behind the log in order; the loop only
 *  waits for it when too many batches are still unapplied.
 *
 *  With a pipeline depth above one the next batch goes out while earlier ones are
 *  still waiting for the broker: appends leave in order on one connection, the
 *  broker's sequence check keeps that order in the log, and they settle here
 *  oldest first. */
async function commitOutcomes({
	scope,
}: {
	scope: PartitionWriterScope;
}): Promise<void> {
	const { state, config } = scope;
	if (state.draining || state.recoveryError) return;
	state.draining = true;
	try {
		while (
			(state.queue.length > 0 || state.inFlight.length > 0) &&
			!state.recoveryError
		) {
			// Answered appends settle first, oldest first, so no caller waits on a later batch.
			while (state.inFlight[0]?.done) {
				if (!(await settleOldestAppend({ scope }))) return;
			}
			if (state.recoveryError) return;
			// Read every pass: the arm may change at a window boundary while batches are in flight.
			const depth = commitPipelineDepthOf({ limits: config.limits });
			const pipeFull = state.inFlight.length >= depth;
			const onlyDeferred =
				holdsOnlyDeferredRecords({ state }) && !state.deferredCommitDue;
			if (state.queue.length === 0 || pipeFull || onlyDeferred) {
				if (state.inFlight.length === 0) {
					if (onlyDeferred) scheduleDeferredCommit({ scope });
					return;
				}
				await awaitPipe({ state, untilEnqueue: !pipeFull && !onlyDeferred });
				continue;
			}
			const storeWaitStartedAt = writerNowOf({ scope });
			while (
				state.unapplied.length >=
				maxUnappliedBatchesOf({ limits: config.limits })
			) {
				hurryApply({ state });
				const oldest = state.unapplied[0]?.batch[0];
				if (oldest)
					await settlementOf({ pending: oldest }).waitForStore().catch(noop);
				if (state.recoveryError) return;
			}
			const lingerStartedAt = writerNowOf({ scope });
			// Lingering only pays behind an append on the wire (the next batch gathers while it
			// flies); adaptive-linger B applies that at depth one too, A keeps today's wait there.
			if (
				(depth === 1 || state.inFlight.length > 0) &&
				!skipsIdleLinger({ inFlight: state.inFlight.length })
			)
				await lingerForBatch({ scope });
			if (state.recoveryError) return;
			if (state.queue.length === 0) continue;
			const batch = takeBatch({ scope });
			const takenAt = writerNowOf({ scope });
			releaseDeferredRecords({ state, batch });
			state.lastBatchSize = batch.length;
			state.lastCommitStartedAt = takenAt;
			sendBatch({
				scope,
				batch,
				waits: {
					queuedMs: queuedMsOf({ batch, takenAt }),
					lingerMs: takenAt - lingerStartedAt,
					storeWaitMs: lingerStartedAt - storeWaitStartedAt,
				},
			});
		}
	} finally {
		state.draining = false;
	}
}

/** Starts the append and records it as in flight; its answer wakes the loop. */
function sendBatch({
	scope,
	batch,
	waits,
}: {
	scope: PartitionWriterScope;
	batch: PendingMutation[];
	waits: CommitWaits;
}): void {
	const { state } = scope;
	const entry: InFlightAppend = {
		batch,
		done: false,
		result: appendBatch({ scope, batch, waits }),
	};
	function markDone(): void {
		entry.done = true;
		state.pipeWake?.();
	}
	entry.result.then(markDone, markDone);
	state.inFlight.push(entry);
}

/** Waits for the oldest append to answer, or for an enqueue too when the pipe still has room. */
function awaitPipe({
	state,
	untilEnqueue,
}: {
	state: PartitionWriterScope["state"];
	untilEnqueue: boolean;
}): Promise<void> {
	const head = state.inFlight[0];
	if (!head || head.done) return Promise.resolve();
	if (!untilEnqueue) return head.result.then(noop, noop);
	return new Promise<void>((resolve) => {
		state.pipeWake = () => {
			state.pipeWake = null;
			resolve();
		};
	});
}

function noop(): void {}

/** Answers the oldest append's callers, or fails them in log order: a batch is judged only
 *  once every batch before it has been settled, so a later refusal never rejects an earlier
 *  success the broker already answered. False when the loop must stop. */
async function settleOldestAppend({
	scope,
}: {
	scope: PartitionWriterScope;
}): Promise<boolean> {
	const { state } = scope;
	const head = state.inFlight[0];
	if (!head) return true;
	const outcome = await head.result;
	// Recovery empties the pipe underneath an awaiting loop.
	if (state.recoveryError) return false;
	if (state.inFlight[0] === head) state.inFlight.shift();
	if ("failed" in outcome) {
		failAppend({ scope, batch: head.batch, cause: outcome.failed });
		return false;
	}
	settleAppended({ scope, batch: head.batch });
	queueApply({ scope, batch: head.batch, baseOffset: outcome.baseOffset });
	return true;
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

/** On a busy partition, whatever is left of the interval since the last commit began; a quiet one never waits. */
function adaptiveLingerMsOf({
	scope,
}: {
	scope: PartitionWriterScope;
}): number {
	if (scope.state.lastBatchSize <= 1) return 0;
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

/** Never rejects: the verdict is handed back for the loop to apply in log order. */
async function appendBatch({
	scope,
	batch,
	waits,
}: {
	scope: PartitionWriterScope;
	batch: PendingMutation[];
	waits: CommitWaits;
}): Promise<AppendOutcome> {
	const { ctx, config } = scope;
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
		return { baseOffset };
	} catch (cause) {
		return { failed: cause };
	}
}

/** A proven no-commit rejects its own batch; anything else is recovery. */
function failAppend({
	scope,
	batch,
	cause,
}: {
	scope: PartitionWriterScope;
	batch: PendingMutation[];
	cause: unknown;
}): void {
	const { state } = scope;
	// Clearing speculative state is only safe when every committed batch is
	// already in the store and no later append was decided on this one;
	// otherwise memory holds rows the store lacks, so the partition rebuilds
	// from the log instead.
	const provenUncommitted =
		cause instanceof MutationBatchNotCommittedError &&
		state.unapplied.length === 0 &&
		state.inFlight.length === 0;
	if (provenUncommitted && !holdsQueuedCommand({ state, batch })) {
		const error = new MutationBatchAppendError({ cause });
		rejectAllPending({ state, batch, error });
		scope.ctx.positions?.failedAbove({ seq: state.commitPos, cause: error });
		state.storeCompletion = Promise.resolve();
	} else {
		enterRecovery({ scope, batch, cause });
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
	const batched = scope.ctx.batchedForget?.() === true;
	if (batched) rememberBatch({ scope, batch });
	for (const pending of batch) {
		if (pending.durability !== "log") continue;
		settlePending({ scope, pending, remembered: batched });
	}
	// Bookkeeping first, position last: a reply released by it may bring the next command at once.
	const last = batch[batch.length - 1];
	if (last && last.seq > scope.state.commitPos) {
		scope.state.commitPos = last.seq;
		scope.ctx.positions?.committed({ seq: last.seq });
	}
}

/** Every "log" record of the batch into the dedup window at once, under one clock read, by its pending key. */
function rememberBatch({
	scope,
	batch,
}: {
	scope: PartitionWriterScope;
	batch: PendingMutation[];
}): void {
	const commands: { key: string; fingerprint: string }[] = [];
	for (const pending of batch)
		if (pending.durability === "log")
			commands.push({
				key: pending.pendingKey,
				fingerprint: pending.mutation.receipt.fingerprint,
			});
	if (commands.length > 0) scope.ctx.recentCommands.rememberAll({ commands });
}

/** Remember the command for dedup (unless the batch already did), unpin the subjects, answer the caller. */
function settlePending({
	scope,
	pending,
	remembered = false,
}: {
	scope: PartitionWriterScope;
	pending: PendingMutation;
	remembered?: boolean;
}): void {
	const { mutation } = pending;
	if (!remembered) scope.ctx.recentCommands.remember({ mutation });
	removePendingMutation({ state: scope.state, pending });
	pending.settlement?.settle({ mutation, state: pending.nextState });
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
				pending.settlement?.rejectCommit({ error: result.cause });
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
		for (const pending of batch) pending.settlement?.settleStore();
		const last = batch[batch.length - 1];
		if (last) advanceStored({ state: scope.state, seq: last.seq });
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
	scope.ctx.positions?.failedAbove({
		seq: scope.state.commitPos,
		cause: error,
	});
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
