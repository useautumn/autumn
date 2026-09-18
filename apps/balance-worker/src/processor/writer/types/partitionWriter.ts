import type {
	MeteringIdentity,
	MutationRecord,
	SubjectState,
} from "@autumn/balance-engine";
import type { MeteringRecord } from "@autumn/kafka";
import type { StateStore } from "../../../state/types/stateStore.js";
import type { ReceiptPolicy } from "../../types/receiptPolicy.js";
import type { SubjectMap } from "../subjectMap/types/subjectMap.js";
import type {
	CommittedMutation,
	DecidedMutation,
	MutationSubmission,
} from "./mutation.js";

export type PartitionWriter = {
	/**
	 * Synchronous: decides against the customer's freshest state and enqueues the
	 * mutation before returning. `.committed` resolves after Kafka commit + SQLite apply.
	 */
	decide<Reply>(submission: MutationSubmission<Reply>): DecidedMutation<Reply>;
	/** Snapshot: waits for the mutations pending for this customer when called, not ones enqueued later. */
	waitForPendingCommits(params: { customerKey: string }): Promise<void>;
	/** Pending projection first, then committed state: what the next decision for this customer would see. */
	readFreshestState(params: {
		identity: MeteringIdentity;
	}): SubjectState | null;
	/** Synchronous: makes fetched rows the subject's resident state unless something fresher is already there. */
	adopt(params: { state: SubjectState }): SubjectState;
};

export type CommittedOutcomeAppender = {
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
		"readState" | "readOwnState" | "readReceipt" | "applyDurableMutations"
	>;
	appender: CommittedOutcomeAppender;
	/** Dedup lives here: the writer fingerprints commands and stamps receipts, the engine never sees either. */
	receiptPolicy: ReceiptPolicy;
};

export type PartitionWriterLimits = {
	maxBatchSize: number;
	maxPendingCommands: number;
	maxPendingCommandsPerCustomer: number;
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
	settlement: PendingSettlement;
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
	drainScheduled: boolean;
	recoveryError: Error | null;
};

export type PartitionWriterScope = {
	ctx: PartitionWriterContext;
	config: PartitionWriterConfig;
	state: PartitionWriterState;
};
