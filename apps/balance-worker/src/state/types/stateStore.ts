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

/** Where a fetched baseline goes: onto the log as an initialize mutation, or straight into the writer's map. */
export type SubjectBaseline = "log" | "map";

/** One partition's resident state: subject states, mutation receipts, Kafka progress. */
export type StateStore = {
	/** "log" when the store is private and must learn baselines from the log; "map" when Postgres already holds them. */
	baseline: SubjectBaseline;
	/** Sync for a resident store, a Promise for one whose bookmark lives elsewhere. */
	initializePartition(params: {
		topic: string;
		partition: number;
		nextOffset: bigint;
	}): void | Promise<void>;
	/** What the identity computes against: the customer's state, merged with the named entity's own. */
	readState(params: { identity: MeteringIdentity }): SubjectState | null;
	/** Only the identity's own rows: the customer's when it names no entity, otherwise that entity's. */
	readOwnState(params: { identity: MeteringIdentity }): SubjectState | null;
	readReceipt(params: {
		identity: MeteringIdentity;
		mutationId: string;
	}): MutationRecord | null;
	readNextOffset(params: { topic: string; partition: number }): bigint | null;
	/** How far the partition's queued commands are decided; null for a store that keeps no such bookmark. */
	readCommandNextOffset(params: {
		topic: string;
		partition: number;
	}): bigint | null;
	/** Completes a consumed command without changing any balance rows. */
	advanceCommandNextOffset(params: {
		topic: string;
		partition: number;
		commandNextOffset: bigint;
	}): void | Promise<void>;
	/** Sync for a resident store, a Promise for one that commits elsewhere; callers await either. */
	applyDurableMutations(params: {
		records: readonly DurableMutationRecord[];
	}): DurableMutationApplyResult[] | Promise<DurableMutationApplyResult[]>;
	close(): void;
};

/** A store whose resident state is private to the process, so it must be checkpointed to survive it. */
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

/** The SQLite store applies synchronously; tests and checkpoints rely on that. */
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
	}): SqliteDurableMutationApplyResult[];
};
