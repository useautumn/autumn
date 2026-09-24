import type {
	MeteringIdentity,
	MutationEffect,
	MutationRecord,
	SubjectState,
} from "@autumn/balance-engine";
import type { MeteringRecord } from "@autumn/kafka";
import type { StateStore } from "../../../state/types/stateStore.js";
import type { ReceiptPolicy } from "../../types/receiptPolicy.js";
import type { RecentCommands } from "../recentCommands/types/recentCommands.js";
import type { SubjectMap } from "../subjectMap/types/subjectMap.js";
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
	/** Snapshot: waits for the mutations pending for this customer when called, not ones enqueued later. */
	waitForPendingCommits(params: { customerKey: string }): Promise<void>;
	/** Pending projection first, then committed state: what the next decision for this customer would see. */
	readFreshestState(params: {
		identity: MeteringIdentity;
	}): SubjectState | null;
	/** Drops the customer's resident rows once Postgres holds its earlier writes, so the next command re-reads them whole. */
	evict(params: { customerKey: string }): Promise<void>;
	/** Synchronous: makes fetched rows the subject's resident state unless something fresher is already there. */
	adopt(params: { state: SubjectState }): SubjectState;
};

export type CommittedOutcomeAppender = {
	commitCommandOffset?(params: {
		topic: string;
		partition: number;
		nextOffset: bigint;
	}): Promise<void>;
	/** Bytes `appendCommitted` would put on the wire for this record; absent, the writer estimates from JSON. Measuring here lets the appender keep the encoding it later sends. */
	encodedBytesOf?(params: { record: MeteringRecord }): number;
	/** Atomically commits all mutations contiguously and returns the first record's offset. */
	appendCommitted(params: {
		topic: string;
		partition: number;
		outcomes: readonly MeteringRecord[];
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
	>;
	appender: CommittedOutcomeAppender;
	/** Dedup lives here: the writer fingerprints commands and stamps receipts, the engine never sees either. */
	receiptPolicy: ReceiptPolicy;
	/** Shared with the partition's log replay, which remembers records this writer never decided. */
	recentCommands: RecentCommands;
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
};

export type PartitionWriterConfig = {
	topic: string;
	partition: number;
	limits: PartitionWriterLimits;
};

/** Callers waiting on one queued mutation; the writer is "new", joiners are "duplicate". */
export type PendingSettlement = {
	join(params: { kind: CommittedMutation["kind"] }): Promise<CommittedMutation>;
	settle(params: { mutation: MutationRecord; state: SubjectState }): void;
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
	/** The subject's rows once this mutation is applied. */
	nextState: SubjectState;
	/** Whether the caller is answered at the append or after the store applies. */
	durability: MutationDurability;
	/** Stamped on the log's copy, never the store's. */
	effects?: MutationEffect[];
	/** The record the log gets, built once: the appender measured this object and sends this object. */
	loggedRecord: MeteringRecord;
	settlement: PendingSettlement;
	/** Bytes of `loggedRecord` on the wire, measured once when queued. */
	encodedBytes: number;
	/** What `waitForPendingCommits()` snapshots for this customer. */
	committed: Promise<CommittedMutation>;
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
