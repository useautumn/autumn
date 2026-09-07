import type {
	PartitionCheckpointPartitionResolver,
	PartitionCheckpointV1,
} from "../../../checkpoint/partitionCheckpoint.js";
import type { PartitionCheckpointSource } from "../../../checkpoint/partitionCheckpointSource.js";
import type { PartitionCheckpointRestoreLimits } from "../../../state/checkpoint/restorePartitionCheckpoint.js";
import type { SqliteBalanceStateStore } from "../../../state/sqliteBalanceStateStore.js";

export type PartitionBootstrapRetryPolicy = {
	maxAttempts: number;
	initialBackoffMs: number;
	maxBackoffMs: number;
};

export type PartitionBootstrapSleep = {
	delayMs: number;
	signal: AbortSignal;
};

export type PartitionBootstrapSleeper = (
	params: PartitionBootstrapSleep,
) => Promise<void>;

export type PartitionBootstrapOptions = {
	stateStore: Pick<
		SqliteBalanceStateStore,
		"initializePartition" | "readNextOffset" | "restorePartitionCheckpoint"
	>;
	checkpointSource: PartitionCheckpointSource;
	partitionResolver: PartitionCheckpointPartitionResolver;
	restoreLimits: PartitionCheckpointRestoreLimits;
	retryPolicy: PartitionBootstrapRetryPolicy;
	sleep?: PartitionBootstrapSleeper;
};

export interface PartitionBootstrapContext extends PartitionBootstrapOptions {
	sleep: PartitionBootstrapSleeper;
}

export type PartitionBootstrapInput = {
	topic: string;
	partition: number;
	logRange: PartitionLogRange;
	signal: AbortSignal;
};

export type PartitionBootstrapParams = PartitionBootstrapInput & {
	ctx: PartitionBootstrapContext;
};

export type PartitionBootstrapper = {
	bootstrap(params: PartitionBootstrapInput): Promise<PartitionBootstrapResult>;
};

export type PartitionBootstrapProgress = {
	localNextOffset: bigint | null;
	needsCheckpoint: boolean;
};

export type PartitionBootstrapState = {
	localNextOffset: bigint | null;
	checkpoint: PartitionCheckpointV1 | null;
	logRange: PartitionLogRange;
};

export type PartitionLogRange = {
	logStartOffset: bigint;
	logEndOffset: bigint;
};

export type PartitionBootstrapRefusalReason =
	| "checkpoint_ahead_of_log_end"
	| "checkpoint_behind_log_start"
	| "checkpoint_required_for_retention_gap"
	| "local_state_ahead_of_log_end";

export type PartitionBootstrapPlan =
	| { kind: "continue"; nextOffset: bigint }
	| { kind: "initialize"; nextOffset: 0n }
	| { kind: "replace"; checkpoint: PartitionCheckpointV1 }
	| { kind: "restore"; checkpoint: PartitionCheckpointV1 }
	| { kind: "refuse"; reason: PartitionBootstrapRefusalReason };

export type PartitionBootstrapResult = {
	kind: "continued" | "initialized" | "replaced" | "restored";
	nextOffset: bigint;
};
