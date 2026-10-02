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
import type { EdgeConfigStore } from "@autumn/edge-config";
import type { MeteringRecord } from "@autumn/kafka";
import type { SubjectSnapshotsEdgeConfig } from "../../../edgeConfig/subjectSnapshotsEdgeConfig.js";
import type { StateStore } from "../../../state/types/stateStore.js";
import type { ReceiptPolicy } from "../../types/receiptPolicy.js";
import type { RecentCommands } from "../recentCommands/types/recentCommands.js";
import type { SubjectMap } from "../subjectMap/types/subjectMap.js";
import type { SubjectMapBudget } from "../subjectMap/types/subjectMapBudget.js";
import type {
	CommittedMutation,
	DecidedMutation,
	MutationDurability,
	MutationSubmission,
} from "./mutation.js";

export type PartitionWriter = {
	/** Snapshot: waits for the current writes to reach the store, not writes enqueued later. */
	waitForStore(): Promise<void>;
	/** Resolves once every batch handed to the store so far has been applied or failed. */
	waitForApplies(): Promise<void>;
	/** Decides and enqueues synchronously; the returned handle tracks durability. */
	decide<Reply>(submission: MutationSubmission<Reply>): DecidedMutation<Reply>;
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
	/** Drops the customer's resident rows once Postgres holds its earlier writes, so the next command re-reads them whole. */
	evict(params: { customerKey: string }): Promise<void>;
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
		| "evictDeletes"
	>;
	appender: CommittedOutcomeAppender;
	/** Read as each batch is applied: a flush carries its customers' intent only while this says write. */
	subjectSnapshots?: EdgeConfigStore<SubjectSnapshotsEdgeConfig>;
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
	now?: () => number;
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
	customerKey: string;
	/** The subjects this mutation projected; pinned in the map until it commits. */
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
	settlement: PendingSettlement;
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
	/** Resolves once every batch handed to the store so far has been applied, in log order. */
	applyTail: Promise<void>;
	/** Whether a store flush is running; the next one takes everything queued by then. */
	applying: boolean;
	drainScheduled: boolean;
	recoveryError: Error | null;
	/** Records in the last batch taken; more than one means arrivals outpace commits and a linger pays. */
	lastBatchSize: number;
	/** Set while the loop lingers; enqueue calls it once the queue holds a full batch. */
	lingerWake: (() => void) | null;
	deferredQueued: number;
	deferredCommitTimer: ReturnType<typeof setTimeout> | null;
	deferredCommitDue: boolean;
};

export type UnappliedBatch = {
	batch: PendingMutation[];
	baseOffset: bigint;
};

export type PartitionWriterScope = {
	ctx: PartitionWriterContext;
	config: PartitionWriterConfig;
	state: PartitionWriterState;
};
