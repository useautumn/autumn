import type {
	CustomerMeteringState,
	StateInitializedEvent,
} from "@autumn/balance-engine";
import type { MeteringRecord } from "@autumn/kafka";
import type { SqliteBalanceStateStore } from "../../../state/sqliteBalanceStateStore.js";
import type { CommittedMutation, MutationSubmission } from "./mutation.js";

export type PartitionWriter = {
	/** Runs `mutate` against the customer's freshest state, then commits what it returns. */
	submitMutation<Reply>(params: {
		submission: MutationSubmission<Reply>;
	}): Promise<Reply | CommittedMutation>;
	/** Writes a customer's first state; resolves "already_initialized" if one exists. */
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
		"readState" | "readTrackReceipt" | "applyDurableMutations"
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
};

/** Mutable writer state: speculative projections and outcomes awaiting commit. */
export type PartitionWriterState = {
	projectedStateByCustomerKey: Map<string, CustomerMeteringState>;
	pendingByKey: Map<string, PendingOutcome>;
	pendingCountByCustomerKey: Map<string, number>;
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
