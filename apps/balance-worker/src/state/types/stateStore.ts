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
} from "./durableMutation.js";

/** One partition's resident state: subject states, mutation receipts, Kafka progress. */
export type StateStore = {
	initializePartition(params: {
		topic: string;
		partition: number;
		nextOffset: bigint;
	}): void;
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
	/** What the identity computes against: the customer's state, merged with the named entity's own. */
	readState(params: { identity: MeteringIdentity }): SubjectState | null;
	/** Only the identity's own rows: the customer's when it names no entity, otherwise that entity's. */
	readOwnState(params: { identity: MeteringIdentity }): SubjectState | null;
	readReceipt(params: {
		identity: MeteringIdentity;
		mutationId: string;
	}): MutationRecord | null;
	readNextOffset(params: { topic: string; partition: number }): bigint | null;
	applyDurableMutations(params: {
		records: readonly DurableMutationRecord[];
	}): DurableMutationApplyResult[];
	close(): void;
};
