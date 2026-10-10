import type {
	MeteringIdentity,
	MutatingCommand,
	MutationEffect,
	MutationRecord,
	MutationSource,
	RowChange,
	SubjectState,
	SubjectStateMutation,
} from "@autumn/balance-engine";
import type {
	DbControlEdgeConfig,
	EdgeConfigStore,
	SubjectSnapshotsEdgeConfig,
} from "@autumn/edge-config";
import type { MeteringRecord } from "@autumn/kafka";
import type { AutumnLogger } from "@autumn/logging";
import type { StateStore } from "../../../state/types/stateStore.js";
import type { ReceiptPolicy } from "../../types/receiptPolicy.js";
import type { RecentCommands } from "../recentCommands/types/recentCommands.js";
import type { SubjectMap } from "../subjectMap/types/subjectMap.js";
import type { SubjectMapBudget } from "../subjectMap/types/subjectMapBudget.js";
import type { CommitPositionSink } from "./commitPositionSink.js";
import type {
	CommittedMutation,
	DecidedMutation,
	HeldDecision,
	HeldSubmission,
	MutationDurability,
	MutationSubmission,
} from "./mutation.js";

export type PartitionWriter = {
	/** Snapshot: waits for the current writes to reach the store, not writes enqueued later. */
	waitForStore(): Promise<void>;
	/** `waitForStore`'s snapshot, taken now; it waits, and wakes a lingering apply, only once called. */
	snapshotStore(): () => Promise<void>;
	/** Resolves once every batch handed to the store so far has been applied or failed. */
	waitForApplies(): Promise<void>;
	/** Decides and enqueues synchronously; the returned handle tracks durability. */
	decide<Reply>(submission: MutationSubmission<Reply>): DecidedMutation<Reply>;
	/** Decides without a settlement: the reply goes out once the commit position reaches its `seq`. Null hands it back. */
	decideHeld<Reply>(
		submission: HeldSubmission<Reply>,
	): HeldDecision<Reply> | null;
	/** Every held write `decide` makes lands in one append when the group fits the byte budget; past it, the ordinary cut splits them.
	 *  The members' subjects stay pinned while `decide` runs. */
	decideHeldGroup<Result>(params: {
		identities: MeteringIdentity[];
		decide: () => Result;
	}): {
		result: Result;
		fitsOneAppend: boolean;
	};
	/** A held write's commit, for a caller that must answer per write; resolves at once if it already settled. */
	waitForHeldCommit(params: {
		identity: MeteringIdentity;
		commandId: string;
	}): Promise<void>;
	/** Why `decideHeld` would hand this command back, or null when it would decide it. */
	heldBlocker(params: {
		identity: MeteringIdentity;
		commandId: string;
	}): HeldBlocker | null;
	/** Appends a record that leaves no rows resident, such as an evict; resolves once Kafka holds it. */
	log(params: {
		command: MutatingCommand;
		mutation: SubjectStateMutation;
		source?: MutationSource;
		defersCommit?: boolean;
	}): Promise<void>;
	flushDeferredLogs(): Promise<void>;
	/** Snapshot: waits for the mutations pending for this customer when called, not ones enqueued later. */
	waitForPendingCommits(params: { customerKey: string }): Promise<void>;
	/** Throws once a commit has failed: the projection past it never became durable, so nothing may be read from it. */
	assertCommitsHealthy(): void;
	/** Pending projection first, then committed state: what the next decision for this customer would see. */
	readFreshestState(params: {
		identity: MeteringIdentity;
	}): SubjectState | null;
	/** The offset of the last record this writer appended; null until its first append. */
	readAppendedThrough(): bigint | null;
	/** Hides the customer's resident rows at once and drops them once Postgres holds the writes before it. */
	evict(params: { customerKey: string }): Promise<void>;
	/** Null unless an evict hid rows whose writes Postgres may still lack; then resolves once it holds them, so a load can read. */
	waitForEvicted(params: { customerKey: string }): Promise<void> | null;
	/** Synchronous: makes fetched rows the subject's resident state unless something fresher is already there.
	 *  `baselineAt` is when the rows were read whole; every snapshot of them carries it. */
	adopt(params: { state: SubjectState; baselineAt?: number }): SubjectState;
	/** Releases the partition's share of the worker's budget and drops its resident rows. */
	dispose(): void;
};

export type CommitWaits = {
	queuedMs: number | null;
	lingerMs: number;
	storeWaitMs: number;
};

export type CommittedOutcomeAppender = {
	commitCommandOffset?(params: {
		topic: string;
		partition: number;
		nextOffset: bigint;
	}): Promise<void>;
	/** Records that the command before `nextOffset` is decided; the offset lands through the group commit
	 *  after a short gap. Never throws: a refused landing is retried, and the Postgres bookmark decides the resume. */
	settleCommandOffset?(params: {
		topic: string;
		partition: number;
		nextOffset: bigint;
	}): void;
	/** Lands whatever `settleCommandOffset` still holds and schedules nothing after; rejects when that landing is refused. */
	flushCommandOffsets?(): Promise<void>;
	/** Bytes `appendCommitted` would put on the wire for this record; absent, the writer estimates from JSON. Measuring here lets the appender keep the encoding it later sends. */
	encodedBytesOf?(params: { record: MeteringRecord }): number;
	/** Atomically commits all mutations contiguously and returns the first record's offset. */
	appendCommitted(params: {
		topic: string;
		partition: number;
		outcomes: readonly MeteringRecord[];
		waits?: CommitWaits;
	}): Promise<{ baseOffset: bigint }>;
};

export type PartitionWriterContext = {
	stateStore: Pick<
		StateStore,
		| "baseline"
		| "readState"
		| "readOwnState"
		| "readReceipt"
		| "applyDurableMutations"
		| "snapshotQueues"
	>;
	appender: CommittedOutcomeAppender;
	/** Read as each batch is applied: a flush carries its customers' intent only while this says write. */
	subjectSnapshotsConfig?: EdgeConfigStore<SubjectSnapshotsEdgeConfig>;
	/** Read before each apply: a set `applyLingerMs` overrides the boot value in `limits`. */
	dbControl?: Pick<EdgeConfigStore<DbControlEdgeConfig>, "get">;
	/** Dedup lives here: the writer fingerprints commands and stamps receipts, the engine never sees either. */
	receiptPolicy: ReceiptPolicy;
	/** Shared with the partition's log replay, which remembers records this writer never decided. */
	recentCommands: RecentCommands;
	/** A decision replaced a customer's projection: `to` follows `from` by the mutation's changes. */
	onStateAdvanced?: (params: {
		from: SubjectState | null;
		to: SubjectState;
		changes: RowChange[];
	}) => void;
	/** Where the partition's commit position is published; without one the writer numbers its writes alone. */
	commitPositions?: CommitPositionSink;
	now?: () => number;
	logger?: Partial<Pick<AutumnLogger, "warn">>;
};

export type PartitionWriterLimits = {
	maxBatchSize: number;
	maxPendingCommands: number;
	maxPendingCommandsPerCustomer: number;
	/** Encoded bytes one Kafka batch may carry; defaults to DEFAULT_MAX_BATCH_BYTES. */
	maxBatchBytes?: number;
	/** Committed batches allowed to wait for the store before committing pauses;
	 *  defaults to DEFAULT_MAX_UNAPPLIED_BATCHES. */
	maxUnappliedBatches?: number;
	/** The worker's resident-state allowance this partition takes a share of; absent, the map keeps its own fixed bound. */
	subjectMapBudget?: SubjectMapBudget;
	/** On a busy partition, how long the writer waits for a batch to fill before committing it; unset or 0 commits at once. */
	commitLingerMs?: number;
	/** How long committed batches gather before a store flush, unless DB control overrides it; unset applies each batch at once. */
	applyLingerMs?: number;
	deferredCommitMs?: number;
};

export type PartitionWriterConfig = {
	topic: string;
	partition: number;
	limits: PartitionWriterLimits;
};

/** Callers waiting on one queued mutation; the writer is "new", joiners are "duplicate". */
export type PendingSettlement = {
	join(params: { kind: CommittedMutation["kind"] }): Promise<CommittedMutation>;
	settle(params: {
		mutation: MutationRecord;
		state: SubjectState | null;
	}): void;
	/** Resolves when Kafka holds the record, whether or not it projected rows. */
	waitForLog(): Promise<void>;
	waitForStore(): Promise<void>;
	settleStore(): void;
	rejectCommit(params: { error: unknown }): void;
	reject(params: { error: unknown }): void;
};

export type PendingMutation = {
	pendingKey: string;
	/** The partition's sequence number for this write, in decide order. */
	seq: number;
	customerKey: string;
	/** The subjects this mutation projected; pinned in the map until the store has it. */
	projectedSubjectKeys: string[];
	mutation: MutationRecord;
	/** The subject's rows once this mutation is applied; null for a log-only record. */
	nextState: SubjectState | null;
	/** Whether the caller is answered at the append or after the store applies. */
	durability: MutationDurability;
	/** Stamped on the log's copy, never the store's. */
	effects?: MutationEffect[];
	/** The record the log gets, built once: the appender measured this object and sends this object. */
	loggedRecord: MeteringRecord;
	/** Null for a held write: nobody awaits it, its reply waits on the commit position. */
	settlement: PendingSettlement | null;
	/** A held write's reply, kept for a retry that arrives while it is in flight. */
	replyBody?: string;
	/** Held writes decided together; one append carries all of them. */
	heldGroup?: number;
	/** Bytes of `loggedRecord` on the wire, measured once when queued. */
	encodedBytes: number;
	defersCommit: boolean;
	queuedAt: number;
};

/** Mutable writer state: the subject map (projected and committed rows) and mutations awaiting commit. */
export type PartitionWriterState = {
	subjects: SubjectMap;
	pendingByKey: Map<string, PendingMutation>;
	pendingByCustomerKey: Map<string, Set<PendingMutation>>;
	queue: PendingMutation[];
	draining: boolean;
	storeCompletion: Promise<void>;
	/** Batches Kafka has but the store has not applied yet, oldest first. */
	unapplied: UnappliedBatch[];
	/** Settles once the append in flight, if any, has its answer; never rejects. */
	appending: Promise<void>;
	/** Resolves once every batch handed to the store so far has been applied, in log order. */
	applyTail: Promise<void>;
	/** Whether a store flush is running; the next one takes everything queued by then. */
	applying: boolean;
	drainScheduled: boolean;
	recoveryError: Error | null;
	/** The offset of the last record this writer appended; null until its first append. */
	appendedThrough: bigint | null;
	/** Records in the last batch taken; more than one means arrivals outpace commits and a linger pays. */
	lastBatchSize: number;
	/** Set while the loop lingers; enqueue calls it once the queue holds a full batch. */
	lingerWake: (() => void) | null;
	/** Set while the apply loop lingers; anything that must not wait for the store calls it. */
	applyWake: (() => void) | null;
	deferredQueued: number;
	deferredCommitTimer: ReturnType<typeof setTimeout> | null;
	deferredCommitDue: boolean;
	/** The last sequence number this writer handed out. */
	lastSeq: number;
	/** The last sequence number whose outcome is published: in the log, or failed. */
	settledSeq: number;
	/** The last write that lands rows, and the last one the store holds; a held write is waited on by these. */
	lastRowSeq: number;
	storedSeq: number;
	storeWaiters: StoreWaiter[];
	/** The group held writes join while `decideHeldGroup` runs. */
	heldGroup: number | null;
	lastHeldGroup: number;
	/** Encoded bytes of the group being decided. */
	heldGroupBytes: number;
};

export type StoreWaiter = {
	seq: number;
	resolve(): void;
	reject(error: unknown): void;
};

export type UnappliedBatch = {
	batch: PendingMutation[];
	baseOffset: bigint;
	committedAt: number;
};

export type PartitionWriterScope = {
	ctx: PartitionWriterContext;
	config: PartitionWriterConfig;
	state: PartitionWriterState;
};

export type HeldBlocker = "settled_write_in_flight" | "retry_in_flight";
