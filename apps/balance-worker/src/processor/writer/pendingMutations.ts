import {
	type MutationEffect,
	type MutationRecord,
	meteringIdentityToSubjectKey,
	type SubjectState,
	splitSubjectState,
} from "@autumn/balance-engine";
import type { MeteringRecord } from "@autumn/kafka";
import { createSubjectMap } from "./subjectMap/createSubjectMap.js";
import type { OnSubjectEvicted } from "./subjectMap/types/subjectMap.js";
import type {
	CommittedMutation,
	MutationDurability,
} from "./types/mutation.js";
import type {
	PartitionWriterScope,
	PartitionWriterState,
	PendingMutation,
	PendingSettlement,
	StoreWaiter,
} from "./types/partitionWriter.js";
import {
	PartitionWriterCapacityError,
	PartitionWriterRecordTooLargeError,
} from "./writerErrors.js";

export function createPartitionWriterState({
	subjectMapMaxBytes,
	subjectIdleExpiryMs,
	onEvicted,
	now,
}: {
	subjectMapMaxBytes?: number | (() => number);
	subjectIdleExpiryMs?: number;
	onEvicted?: OnSubjectEvicted;
	now?: () => number;
} = {}): PartitionWriterState {
	return {
		subjects: createSubjectMap({
			maxBytes: subjectMapMaxBytes,
			idleExpiryMs: subjectIdleExpiryMs,
			onEvicted,
			now,
		}),
		pendingByKey: new Map(),
		pendingByCustomerKey: new Map(),
		queue: [],
		draining: false,
		storeCompletion: Promise.resolve(),
		unapplied: [],
		appending: Promise.resolve(),
		applyTail: Promise.resolve(),
		applying: false,
		drainScheduled: false,
		recoveryError: null,
		appendedThrough: null,
		lastBatchSize: 0,
		lingerWake: null,
		applyWake: null,
		deferredQueued: 0,
		deferredCommitTimer: null,
		deferredCommitDue: false,
		lastSeq: 0,
		settledSeq: 0,
		lastRowSeq: 0,
		storedSeq: 0,
		storeWaiters: [],
		heldGroup: null,
		heldGroupBytes: 0,
		lastHeldGroup: 0,
	};
}

export function pendingKeyOf({
	customerKey,
	commandId,
}: {
	customerKey: string;
	commandId: string;
}): string {
	return JSON.stringify([customerKey, commandId]);
}

export function createPendingSettlement(): PendingSettlement {
	const stored = Promise.withResolvers<void>();
	void stored.promise.catch(() => undefined);
	const logged = Promise.withResolvers<void>();
	void logged.promise.catch(() => undefined);
	const waiters: {
		kind: CommittedMutation["kind"];
		resolvers: ReturnType<typeof Promise.withResolvers<CommittedMutation>>;
	}[] = [];

	function join({
		kind,
	}: {
		kind: CommittedMutation["kind"];
	}): Promise<CommittedMutation> {
		const resolvers = Promise.withResolvers<CommittedMutation>();
		waiters.push({ kind, resolvers });
		return resolvers.promise;
	}

	function settle({
		mutation,
		state,
	}: {
		mutation: MutationRecord;
		state: SubjectState | null;
	}): void {
		logged.resolve();
		if (!state) return;
		for (const { kind, resolvers } of waiters) {
			resolvers.resolve({ kind, mutation, state });
		}
	}

	function waitForLog(): Promise<void> {
		return logged.promise;
	}

	function waitForStore(): Promise<void> {
		return stored.promise;
	}

	function settleStore(): void {
		stored.resolve();
	}

	function rejectCommit({ error }: { error: unknown }): void {
		logged.reject(error);
		for (const { resolvers } of waiters) resolvers.reject(error);
	}

	function reject({ error }: { error: unknown }): void {
		rejectCommit({ error });
		stored.reject(error);
	}

	return {
		join,
		settle,
		waitForLog,
		waitForStore,
		settleStore,
		rejectCommit,
		reject,
	};
}

/** Kafka refuses a batch over the topic's max.message.bytes (1 MiB by default).
 *  gzip only saves about a quarter on these records, so the raw budget stays
 *  well under the limit rather than counting on compression. */
export const DEFAULT_MAX_BATCH_BYTES = 800_000;
export const RECORD_OVERHEAD_BYTES = 256;

export function loggedRecordOf({
	mutation,
	effects,
}: {
	mutation: MutationRecord;
	effects?: MutationEffect[];
}): MeteringRecord {
	if (!effects) return mutation;
	return { ...mutation, effects };
}

export const DEFAULT_MAX_UNAPPLIED_BATCHES = 64;

export const maxUnappliedBatchesOf = ({
	limits,
}: {
	limits: PartitionWriterScope["config"]["limits"];
}): number => limits.maxUnappliedBatches ?? DEFAULT_MAX_UNAPPLIED_BATCHES;

export const DEFAULT_MAX_BATCHES_PER_FLUSH = 32;

export const maxBatchesPerFlushOf = ({
	ctx,
	limits,
}: {
	ctx: Pick<PartitionWriterScope["ctx"], "dbControl">;
	limits: PartitionWriterScope["config"]["limits"];
}): number => {
	const configured =
		ctx.dbControl?.get().balanceCommitter.maxBatchesPerFlush ??
		limits.maxBatchesPerFlush ??
		DEFAULT_MAX_BATCHES_PER_FLUSH;
	return Math.min(Math.max(configured, 1), maxUnappliedBatchesOf({ limits }));
};

export const maxBatchBytesOf = ({
	limits,
}: {
	limits: PartitionWriterScope["config"]["limits"];
}): number => limits.maxBatchBytes ?? DEFAULT_MAX_BATCH_BYTES;

export const writerNowOf = ({ scope }: { scope: PartitionWriterScope }) =>
	scope.ctx.now?.() ?? performance.now();

export function enqueueMutation({
	scope,
	pendingKey,
	customerKey,
	mutation,
	nextState,
	projectedStates: explicitProjectedStates,
	durability,
	effects,
	defersCommit = false,
	held = false,
}: {
	scope: PartitionWriterScope;
	pendingKey: string;
	customerKey: string;
	mutation: MutationRecord;
	nextState: SubjectState | null;
	projectedStates?: SubjectState[];
	durability: MutationDurability;
	effects?: MutationEffect[];
	defersCommit?: boolean;
	held?: boolean;
}): PendingMutation {
	const { state, config } = scope;
	const customerPending =
		state.pendingByCustomerKey.get(customerKey) ?? new Set<PendingMutation>();
	if (
		state.pendingByKey.size >= config.limits.maxPendingCommands ||
		customerPending.size >= config.limits.maxPendingCommandsPerCustomer
	) {
		throw new PartitionWriterCapacityError();
	}
	const loggedRecord = loggedRecordOf({ mutation, effects });
	const encodedBytes =
		(scope.ctx.appender.encodedBytesOf?.({ record: loggedRecord }) ??
			Buffer.byteLength(JSON.stringify(loggedRecord))) + RECORD_OVERHEAD_BYTES;
	const maxBatchBytes = maxBatchBytesOf({ limits: config.limits });
	if (encodedBytes > maxBatchBytes)
		throw new PartitionWriterRecordTooLargeError({
			bytes: encodedBytes,
			maxBatchBytes,
		});
	const settlement = held ? null : createPendingSettlement();
	const projectedStates =
		explicitProjectedStates ??
		(nextState ? projectedStatesOf({ state: nextState }) : []);
	const seq = scope.ctx.commitPositions?.nextSeq() ?? state.lastSeq + 1;
	state.lastSeq = seq;
	const pending: PendingMutation = {
		pendingKey,
		seq,
		customerKey,
		projectedSubjectKeys: projectedStates.map((projected) =>
			meteringIdentityToSubjectKey({ identity: projected.identity }),
		),
		mutation,
		nextState,
		durability,
		effects,
		loggedRecord,
		settlement,
		encodedBytes,
		defersCommit,
		queuedAt: writerNowOf({ scope }),
		...(held && state.heldGroup !== null && { heldGroup: state.heldGroup }),
	};
	for (const [index, projected] of projectedStates.entries()) {
		const subjectKey = pending.projectedSubjectKeys[index];
		if (!subjectKey) continue;
		state.subjects.pin({ subjectKey });
		state.subjects.setState({ subjectKey, customerKey, state: projected });
	}
	state.pendingByKey.set(pendingKey, pending);
	customerPending.add(pending);
	state.pendingByCustomerKey.set(customerKey, customerPending);
	state.queue.push(pending);
	if (pending.heldGroup !== undefined) state.heldGroupBytes += encodedBytes;
	if (defersCommit) state.deferredQueued += 1;
	if (nextState) state.lastRowSeq = seq;
	if (nextState && settlement)
		state.storeCompletion = settlement.waitForStore();
	if (state.lingerWake && state.queue.length >= config.limits.maxBatchSize) {
		state.lingerWake();
	}
	return pending;
}

const projectedStatesOf = ({ state }: { state: SubjectState }) => {
	const states = splitSubjectState({ state });
	return states.entity ? [states.customer, states.entity] : [states.customer];
};

export function pendingCommitsFor({
	state,
	customerKey,
}: {
	state: PartitionWriterState;
	customerKey: string;
}): Promise<void>[] {
	const customerPending = state.pendingByCustomerKey.get(customerKey);
	if (!customerPending) return [];
	const commits: Promise<void>[] = [];
	for (const pending of customerPending)
		if (pending.nextState) commits.push(settlementOf({ pending }).waitForLog());
	return commits;
}

export function removePendingMutation({
	state,
	pending,
}: {
	state: PartitionWriterState;
	pending: PendingMutation;
}): void {
	state.pendingByKey.delete(pending.pendingKey);
	const customerPending = state.pendingByCustomerKey.get(pending.customerKey);
	customerPending?.delete(pending);
	if (customerPending && customerPending.size === 0) {
		state.pendingByCustomerKey.delete(pending.customerKey);
	}
}

export function releasePins({
	state,
	pending,
}: {
	state: PartitionWriterState;
	pending: PendingMutation;
}): void {
	for (const subjectKey of pending.projectedSubjectKeys)
		state.subjects.unpin({ subjectKey });
}

export function rejectAllPending({
	state,
	batch,
	error,
}: {
	state: PartitionWriterState;
	batch: readonly PendingMutation[];
	error: Error;
}): void {
	for (const pending of state.pendingByKey.values()) {
		pending.settlement?.reject({ error });
	}
	for (const pending of batch) pending.settlement?.reject({ error });
	for (const waiter of state.storeWaiters) waiter.reject(error);
	state.storeWaiters = [];
	state.queue.length = 0;
	state.deferredQueued = 0;
	if (state.deferredCommitTimer) clearTimeout(state.deferredCommitTimer);
	state.deferredCommitTimer = null;
	state.deferredCommitDue = false;
	state.pendingByKey.clear();
	state.pendingByCustomerKey.clear();
	state.subjects.clear();
}

export function settlementOf({
	pending,
}: {
	pending: PendingMutation;
}): PendingSettlement {
	pending.settlement ??= createPendingSettlement();
	return pending.settlement;
}

export function awaitStored({
	state,
	seq,
}: {
	state: PartitionWriterState;
	seq: number;
}): Promise<void> {
	if (state.storedSeq >= seq) return Promise.resolve();
	if (state.recoveryError) return Promise.reject(state.recoveryError);
	const { promise, resolve, reject } = Promise.withResolvers<void>();
	state.storeWaiters.push({ seq, resolve, reject });
	state.applyWake?.();
	return promise;
}

export function allStored({
	state,
}: {
	state: PartitionWriterState;
}): Promise<void> {
	return snapshotAllStored({ state })();
}

export function snapshotAllStored({
	state,
}: {
	state: PartitionWriterState;
}): () => Promise<void> {
	const { lastRowSeq, storeCompletion } = state;
	return () =>
		Promise.all([
			storeCompletion,
			awaitStored({ state, seq: lastRowSeq }),
		]).then(nothing);
}

function nothing(): void {}

export function advanceStored({
	state,
	seq,
}: {
	state: PartitionWriterState;
	seq: number;
}): void {
	if (seq <= state.storedSeq) return;
	state.storedSeq = seq;
	const waiting: StoreWaiter[] = [];
	for (const waiter of state.storeWaiters)
		if (waiter.seq <= seq) waiter.resolve();
		else waiting.push(waiter);
	state.storeWaiters = waiting;
}
