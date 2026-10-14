import type {
	EdgeConfigStore,
	SubjectSnapshotsEdgeConfig,
} from "@autumn/edge-config";
import type { DeletedSubjectSnapshot } from "@autumn/postgres";
import type { DurableMutationRecord } from "../../state/types/durableMutation.js";
import type { SnapshotIntent } from "../../state/types/snapshotIntent.js";
import type { OwnerFence, StateStore } from "../../state/types/stateStore.js";
import type { CommitterDb } from "../../types/committerDb.js";

export type CommitterControl = { concurrency: number | null };

export type CommitterContext = {
	db: CommitterDb;
	logger?: {
		info(message: string): void;
		warn(message: string): void;
		error(message: string): void;
	};
	sleep?: (params: { delayMs: number; signal: AbortSignal }) => Promise<void>;
	control?: { read(): CommitterControl };
	subjectSnapshotsConfig?: EdgeConfigStore<SubjectSnapshotsEdgeConfig>;
};

export type FlushRetryPolicy = {
	degradedAfterAttempts: number;
	initialBackoffMs: number;
	maxBackoffMs: number;
};

export type CommitterConfig = {
	concurrency: number;
	maxRowsPerFlush: number;
	retry: FlushRetryPolicy;
	snapshots?: { partitionCount: number };
};

export type PartitionPosition = { topic: string; partition: number };

export type FlushRejection = { record: DurableMutationRecord; cause: Error };

export type FlushOutcome = {
	nextOffset: bigint;
	deletedSnapshots?: DeletedSubjectSnapshot[];
	commandNextOffset?: bigint;
	ownerFence?: OwnerFence;
	failure?: { record: DurableMutationRecord; cause: unknown };
	rejections?: FlushRejection[];
};

export type FlushCall = PartitionPosition & {
	expectedOffset: bigint;
	commandNextOffset?: bigint;
	ownerFence?: OwnerFence;
	claimToken?: string;
	records: readonly DurableMutationRecord[];
	snapshotIntent?: SnapshotIntent;
	rows: number;
	settle: ReturnType<typeof Promise.withResolvers<FlushOutcome>>;
};

export type Flush = { calls: FlushCall[] };

export type CommitterState = {
	queue: FlushCall[];
	inFlight: number;
	degraded: boolean;
	stop: AbortController;
};

export type CommitterScope = {
	ctx: CommitterContext;
	config: CommitterConfig;
	state: CommitterState;
};

export type Committer = {
	apply(
		params: PartitionPosition & {
			expectedOffset: bigint;
			commandNextOffset?: bigint;
			ownerFence?: OwnerFence;
			claimToken?: string;
			records: readonly DurableMutationRecord[];
			snapshotIntent?: SnapshotIntent;
		},
	): Promise<FlushOutcome>;
	drain(): Promise<void>;
	stop(): void;
};

export type CommitterStateStore = StateStore & {
	loadProgress(params: PartitionPosition): Promise<void>;
	claimPartition(params: PartitionPosition): Promise<void>;
};
