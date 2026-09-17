import type {
	CustomerMeteringState,
	StateInitializedEvent,
} from "@autumn/balance-engine";
import type { MeteringRecord } from "@autumn/kafka";
import type { SqliteBalanceStateStore } from "../../../state/sqliteBalanceStateStore.js";
import type {
	CommittedMutation,
	DecidedMutation,
	MutationSubmission,
} from "./mutation.js";

export type PartitionWriter = {
	/**
	 * Synchronous: decides against the customer's freshest state and enqueues the
	 * outcome before returning. `.committed` resolves after Kafka commit + SQLite apply.
	 */
	decide<Reply>(submission: MutationSubmission<Reply>): DecidedMutation<Reply>;
	/** Snapshot: waits for the outcomes pending for this customer when called, not ones enqueued later. */
	waitForPendingCommits(params: { customerKey: string }): Promise<void>;
	/** Writes a first baseline or acknowledges the original initialization identity. */
	submitInitialization(params: {
		initialization: StateInitializedEvent;
	}): Promise<CommittedMutation | { kind: "already_initialized" }>;
};

export type CommittedOutcomeAppender = {
	/** Atomically commits all outcomes contiguously and returns the first record's offset. */
	appendCommitted(params: {
		topic: string;
		partition: number;
		outcomes: readonly MeteringRecord[];
	}): Promise<{ baseOffset: bigint }>;
};

export type PartitionWriterContext = {
	stateStore: Pick<
		SqliteBalanceStateStore,
		| "readState"
		| "readInitializationReceipt"
		| "readTrackReceipt"
		| "applyDurableMutations"
	>;
	appender: CommittedOutcomeAppender;
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

/** Callers waiting on one queued outcome; the writer is "new", joiners are "duplicate". */
export type PendingSettlement = {
	join(params: { kind: CommittedMutation["kind"] }): Promise<CommittedMutation>;
	settle(params: { outcome: MeteringRecord }): void;
	reject(params: { error: unknown }): void;
};

export type PendingOutcome = {
	pendingKey: string;
	customerKey: string;
	outcome: MeteringRecord;
	settlement: PendingSettlement;
	/** What `waitForPendingCommits()` snapshots for this customer. */
	committed: Promise<CommittedMutation>;
};

/** Mutable writer state: speculative projections and outcomes awaiting commit. */
export type PartitionWriterState = {
	projectedStateByCustomerKey: Map<string, CustomerMeteringState>;
	pendingByKey: Map<string, PendingOutcome>;
	pendingByCustomerKey: Map<string, Set<PendingOutcome>>;
	queue: PendingOutcome[];
	draining: boolean;
	drainScheduled: boolean;
	recoveryError: Error | null;
};

export type PartitionWriterScope = {
	ctx: PartitionWriterContext;
	config: PartitionWriterConfig;
	state: PartitionWriterState;
};
