import {
	type MutationEffect,
	type MutationRecord,
	meteringIdentityToSubjectKey,
	type SubjectState,
	splitSubjectState,
} from "@autumn/balance-engine";
import type { MeteringRecord } from "@autumn/kafka";
import { createSubjectMap } from "./subjectMap/createSubjectMap.js";
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
	start,
}: {
	subjectMapMaxBytes?: number | (() => number);
	/** Where an earlier writer of the partition left its sequence numbers; a fresh partition starts at 0. */
	start?: { commitPos: number; lastSeq: number };
} = {}): PartitionWriterState {
	return {
		subjects: createSubjectMap({ maxBytes: subjectMapMaxBytes }),
		pendingByKey: new Map(),
		pendingByCustomerKey: new Map(),
		queue: [],
		draining: false,
		storeCompletion: Promise.resolve(),
		lastSeq: start?.lastSeq ?? 0,
		lastRowSeq: 0,
		commitPos: start?.commitPos ?? 0,
		storedSeq: 0,
		storeWaiters: [],
		inFlight: [],
		pipeWake: null,
		unapplied: [],
		applyTail: Promise.resolve(),
		applying: false,
		drainScheduled: false,
		recoveryError: null,
		lastBatchSize: 0,
		lingerWake: null,
		lastCommitStartedAt: Number.NEGATIVE_INFINITY,
		lastApplyStartedAt: Number.NEGATIVE_INFINITY,
		applyHurried: false,
		applyWake: null,
		deferredQueued: 0,
		deferredCommitTimer: null,
		deferredCommitDue: false,
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
	// Log-only callers may never wait for the store; failure still reaches store waiters.
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
		// A log-only record projected no rows, and only a write is ever joined for them.
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
/** Key, envelope and Kafka's per-record framing beside the JSON payload. */
export const RECORD_OVERHEAD_BYTES = 256;

/** The record the log receives: the mutation plus its effects; the store, receipts and checkpoints hold it without them. */
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

/** Bounds how far the store may trail the log: each unapplied batch keeps its
 *  store-durability callers waiting and its milestones in memory. */
export const DEFAULT_MAX_UNAPPLIED_BATCHES = 16;

export const maxUnappliedBatchesOf = ({
	limits,
}: {
	limits: PartitionWriterScope["config"]["limits"];
}): number => limits.maxUnappliedBatches ?? DEFAULT_MAX_UNAPPLIED_BATCHES;

export const maxBatchBytesOf = ({
	limits,
}: {
	limits: PartitionWriterScope["config"]["limits"];
}): number => limits.maxBatchBytes ?? DEFAULT_MAX_BATCH_BYTES;

export const writerNowOf = ({ scope }: { scope: PartitionWriterScope }) =>
	scope.ctx.now?.() ?? performance.now();

/** A queued mutation owns both durability milestones, even after its log reply releases its pins. */
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
	projects = true,
	lean = false,
}: {
	scope: PartitionWriterScope;
	pendingKey: string;
	customerKey: string;
	mutation: MutationRecord;
	/** Null for a log-only record: it leaves no rows resident. */
	nextState: SubjectState | null;
	projectedStates?: SubjectState[];
	durability: MutationDurability;
	effects?: MutationEffect[];
	defersCommit?: boolean;
	/** False inside a run: only the run's last write projects its rows, once, with `projectPending`. */
	projects?: boolean;
	/** A lean write: no settlement; its reply waits on the commit position. */
	lean?: boolean;
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
	// Refused before anything is projected: a record no batch can carry would
	// otherwise fail at commit and take the partition, and its worker, with it.
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
	const settlement = lean ? null : createPendingSettlement();
	// The sink numbers a partition across its writers; without one the writer counts alone.
	const seq = scope.ctx.positions?.nextSeq() ?? state.lastSeq + 1;
	state.lastSeq = seq;
	const pending: PendingMutation = {
		pendingKey,
		customerKey,
		seq,
		projectedSubjectKeys: [],
		mutation,
		nextState,
		durability,
		effects,
		loggedRecord,
		settlement,
		encodedBytes,
		defersCommit,
		queuedAt: writerNowOf({ scope }),
	};
	if (projects)
		projectPending({
			scope,
			pending,
			projectedStates: explicitProjectedStates,
		});
	state.pendingByKey.set(pendingKey, pending);
	customerPending.add(pending);
	state.pendingByCustomerKey.set(customerKey, customerPending);
	state.queue.push(pending);
	if (defersCommit) state.deferredQueued += 1;
	// A log-only record lands no rows, so nothing that re-reads Postgres waits for it:
	// an evict behind it enqueues its own record straight away and shares the next commit.
	// A lean write is waited on by position instead (`allStored`).
	if (nextState) state.lastRowSeq = pending.seq;
	if (nextState && settlement)
		state.storeCompletion = settlement.waitForStore();
	// A lingering commit loop has what it was waiting for.
	if (state.lingerWake && state.queue.length >= config.limits.maxBatchSize) {
		state.lingerWake();
	}
	// A loop idling with room in the pipe has something to send.
	state.pipeWake?.();
	return pending;
}

/** Makes the pending's rows the subjects' resident state, pinned until it commits. */
export function projectPending({
	scope,
	pending,
	projectedStates: explicitProjectedStates,
}: {
	scope: PartitionWriterScope;
	pending: PendingMutation;
	projectedStates?: SubjectState[];
}): void {
	const projectedStates =
		explicitProjectedStates ??
		(pending.nextState ? projectedStatesOf({ state: pending.nextState }) : []);
	pending.projectedSubjectKeys = projectedStates.map((projected) =>
		meteringIdentityToSubjectKey({ identity: projected.identity }),
	);
	for (const [index, projected] of projectedStates.entries()) {
		const subjectKey = pending.projectedSubjectKeys[index];
		if (!subjectKey) continue;
		scope.state.subjects.pin({ subjectKey });
		scope.state.subjects.setState({
			subjectKey,
			customerKey: pending.customerKey,
			state: projected,
		});
	}
}

/** The customer's part, and the part of the entity the state names. */
const projectedStatesOf = ({ state }: { state: SubjectState }) => {
	const states = splitSubjectState({ state });
	return states.entity ? [states.customer, states.entity] : [states.customer];
};

/** A classic caller waiting on a lean write gets a settlement after all; the commit settles it like any other. */
export function settlementOf({
	pending,
}: {
	pending: PendingMutation;
}): PendingSettlement {
	pending.settlement ??= createPendingSettlement();
	return pending.settlement;
}

/** Resolves once the store holds every write up to `seq`; rejects if the writer fails before then. */
export function awaitStored({
	state,
	seq,
}: {
	state: PartitionWriterState;
	seq: number;
}): Promise<void> {
	if (state.storedSeq >= seq) return Promise.resolve();
	if (state.recoveryError) return Promise.reject(state.recoveryError);
	return new Promise<void>((resolve, reject) => {
		state.storeWaiters.push({ seq, resolve, reject });
	});
}

/** Every row-landing write handed out so far, classic or lean, is in the store; rejects if the writer fails first. */
export function allStored({
	state,
}: {
	state: PartitionWriterState;
}): Promise<void> {
	const stored = Promise.all([
		state.storeCompletion,
		awaitStored({ state, seq: state.lastRowSeq }),
	]).then(noop);
	// Taken eagerly by callers that may never wait on it; the failure still reaches those that do.
	void stored.catch(noop);
	return stored;
}

function noop(): void {}

/** The store now holds every write up to `seq`. */
export function advanceStored({
	state,
	seq,
}: {
	state: PartitionWriterState;
	seq: number;
}): void {
	if (seq <= state.storedSeq) return;
	state.storedSeq = seq;
	const kept: StoreWaiter[] = [];
	for (const waiter of state.storeWaiters) {
		if (waiter.seq <= seq) waiter.resolve();
		else kept.push(waiter);
	}
	state.storeWaiters = kept;
}

/** Snapshot at call time: mutations enqueued later must not extend the wait. */
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
	// The committed rows stay resident; only the pin that kept them from eviction is released.
	for (const subjectKey of pending.projectedSubjectKeys) {
		state.subjects.unpin({ subjectKey });
	}
	const customerPending = state.pendingByCustomerKey.get(pending.customerKey);
	customerPending?.delete(pending);
	if (customerPending && customerPending.size === 0) {
		state.pendingByCustomerKey.delete(pending.customerKey);
	}
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
	// Log-acknowledged writes have left pendingByKey but still own an unfinished store milestone.
	for (const pending of batch) pending.settlement?.reject({ error });
	for (const waiter of state.storeWaiters) waiter.reject(error);
	state.storeWaiters = [];
	// Nothing dropped here will ever be stored: later store waits cover only what is written from now on.
	state.lastRowSeq = state.storedSeq;
	state.queue.length = 0;
	state.inFlight.length = 0;
	state.deferredQueued = 0;
	if (state.deferredCommitTimer) clearTimeout(state.deferredCommitTimer);
	state.deferredCommitTimer = null;
	state.deferredCommitDue = false;
	state.pendingByKey.clear();
	state.pendingByCustomerKey.clear();
	state.subjects.clear();
}

/** A caller is waiting on the store: a flush held back to coalesce goes now. */
export function hurryApply({ state }: { state: PartitionWriterState }): void {
	state.applyHurried = true;
	state.applyWake?.();
}
