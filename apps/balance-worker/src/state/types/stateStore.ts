import type {
	MeteringIdentity,
	MutationRecord,
	SubjectState,
} from "@autumn/balance-engine";
import type {
	PartitionCheckpointPartitionResolver,
	PartitionCheckpointV1,
	PreparedPartitionCheckpoint,
} from "../../checkpoint/partitionCheckpoint.js";
import type { SnapshotQueues } from "../../committer/subjectSnapshots/types/snapshotQueues.js";
import type { PartitionCheckpointCaptureLimits } from "../actions/checkpoint/capturePartitionCheckpoint.js";
import type {
	PartitionCheckpointRestoreLimits,
	PartitionCheckpointRestoreMode,
} from "../actions/checkpoint/restorePartitionCheckpoint.js";
import type {
	DurableMutationApplyResult,
	DurableMutationRecord,
	SqliteDurableMutationApplyResult,
} from "./durableMutation.js";
import type { SnapshotIntent } from "./snapshotIntent.js";

export type SubjectBaseline = "log" | "map";

export type OwnerFence = { epoch: bigint; offset: bigint };

export type ApplyWaits = {
	unappliedMs: number;
};

export type StateStore = {
	baseline: SubjectBaseline;
	initializePartition(params: {
		topic: string;
		partition: number;
		nextOffset: bigint;
	}): void | Promise<void>;
	readState(params: { identity: MeteringIdentity }): SubjectState | null;
	readOwnState(params: { identity: MeteringIdentity }): SubjectState | null;
	readReceipt(params: {
		identity: MeteringIdentity;
		mutationId: string;
	}): MutationRecord | null;
	readNextOffset(params: { topic: string; partition: number }): bigint | null;
	readCommandNextOffset(params: {
		topic: string;
		partition: number;
	}): bigint | null;
	advanceCommandNextOffset(params: {
		topic: string;
		partition: number;
		commandNextOffset: bigint;
	}): void | Promise<void>;
	claimPartition?(params: { topic: string; partition: number }): Promise<void>;
	readOwnerFence?(params: {
		topic: string;
		partition: number;
	}): OwnerFence | null;
	advanceOwnerFence?(params: {
		topic: string;
		partition: number;
		fence: OwnerFence;
	}): void | Promise<void>;
	snapshotQueues?: SnapshotQueues;
	applyDurableMutations(params: {
		records: readonly DurableMutationRecord[];
		snapshotIntent?: SnapshotIntent;
		waits?: ApplyWaits;
	}): DurableMutationApplyResult[] | Promise<DurableMutationApplyResult[]>;
	close(): void;
};

export type CheckpointStateStore = StateStore & {
	restorePartitionCheckpoint(params: {
		checkpoint: PartitionCheckpointV1;
		mode: PartitionCheckpointRestoreMode;
		limits: PartitionCheckpointRestoreLimits;
		partitionResolver: PartitionCheckpointPartitionResolver;
	}): void;
	capturePartitionCheckpoint(params: {
		topic: string;
		partition: number;
		createdAt: number;
		limits: PartitionCheckpointCaptureLimits;
		consumedNextOffset?: bigint | null;
	}): PreparedPartitionCheckpoint;
	pruneExpiredReceipts(params: {
		topic: string;
		partition: number;
		expiresAtOrBefore: number;
		limit: number;
	}): { deletedCount: number };
};

export type SqliteStateStore = Omit<
	CheckpointStateStore,
	"applyDurableMutations" | "initializePartition"
> & {
	initializePartition(params: {
		topic: string;
		partition: number;
		nextOffset: bigint;
	}): void;
	applyDurableMutations(params: {
		records: readonly DurableMutationRecord[];
		snapshotIntent?: SnapshotIntent;
	}): SqliteDurableMutationApplyResult[];
};
