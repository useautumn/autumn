import {
	assertPartitionCheckpointOwnership,
	type PartitionCheckpointPartitionResolver,
	type PartitionCheckpointV1,
	serializePartitionCheckpoint,
} from "../../../checkpoint/partitionCheckpoint.js";
import {
	assertPartitionCheckpointLimits,
	assertPartitionCheckpointWithinLimit,
	PartitionCheckpointLimitExceededError,
	type PartitionCheckpointLimits,
} from "../../../checkpoint/partitionCheckpointLimits.js";
import { insertReceipt } from "../../repos/mutationReceipts/mutationReceipts.js";
import {
	deletePartitionProgress,
	insertPartitionProgress,
	readNextOffset,
} from "../../repos/partitionProgress.js";
import { insertBlob } from "../../repos/subjectStates/subjectStates.js";
import type { StateStoreContext } from "../../types/stateStoreContext.js";

export type PartitionCheckpointRestoreMode = "replace" | "restore";

export type PartitionCheckpointRestoreLimits = PartitionCheckpointLimits;
export { PartitionCheckpointLimitExceededError };

export class PartitionCheckpointRestoreConflictError extends Error {
	constructor({
		topic,
		partition,
		mode,
	}: {
		topic: string;
		partition: number;
		mode: PartitionCheckpointRestoreMode;
	}) {
		super(
			`Cannot ${mode} checkpoint for ${topic}[${partition}] from its current local state`,
		);
		this.name = "PartitionCheckpointRestoreConflictError";
	}
}

const validateCheckpoint = ({
	checkpoint,
	limits,
	partitionResolver,
}: {
	checkpoint: PartitionCheckpointV1;
	limits: PartitionCheckpointRestoreLimits;
	partitionResolver: PartitionCheckpointPartitionResolver;
}): void => {
	assertPartitionCheckpointLimits({ limits });
	assertPartitionCheckpointWithinLimit({
		limitName: "states",
		limit: limits.maxStates,
		observed: checkpoint.states.length,
	});
	assertPartitionCheckpointWithinLimit({
		limitName: "receipts",
		limit: limits.maxReceipts,
		observed: checkpoint.receipts.length,
	});
	const serializedBytes = Buffer.byteLength(
		serializePartitionCheckpoint({ checkpoint }),
		"utf8",
	);
	assertPartitionCheckpointWithinLimit({
		limitName: "serialized_bytes",
		limit: limits.maxSerializedBytes,
		observed: serializedBytes,
	});
	assertPartitionCheckpointOwnership({
		checkpoint,
		topic: checkpoint.topic,
		partition: checkpoint.partition,
		partitionResolver,
	});
};

export const restorePartitionCheckpoint = ({
	ctx,
	checkpoint,
	mode,
	limits,
	partitionResolver,
}: {
	ctx: StateStoreContext;
	checkpoint: PartitionCheckpointV1;
	mode: PartitionCheckpointRestoreMode;
	limits: PartitionCheckpointRestoreLimits;
	partitionResolver: PartitionCheckpointPartitionResolver;
}): void => {
	validateCheckpoint({ checkpoint, limits, partitionResolver });

	ctx.sqliteDb
		.transaction(() => {
			const existingNextOffset = readNextOffset({
				ctx,
				topic: checkpoint.topic,
				partition: checkpoint.partition,
			});
			const hasExistingPartition = existingNextOffset !== null;
			if (
				(mode === "restore" && hasExistingPartition) ||
				(mode === "replace" && !hasExistingPartition)
			) {
				throw new PartitionCheckpointRestoreConflictError({
					topic: checkpoint.topic,
					partition: checkpoint.partition,
					mode,
				});
			}

			if (mode === "replace") {
				deletePartitionProgress({
					ctx,
					topic: checkpoint.topic,
					partition: checkpoint.partition,
				});
			}

			insertPartitionProgress({
				ctx,
				topic: checkpoint.topic,
				partition: checkpoint.partition,
				nextOffset: checkpoint.nextOffset,
			});
			for (const checkpointState of checkpoint.states) {
				insertBlob({
					ctx,
					topic: checkpoint.topic,
					partition: checkpoint.partition,
					state: checkpointState.state,
				});
			}
			for (const checkpointReceipt of checkpoint.receipts) {
				insertReceipt({
					ctx,
					partitionKey: checkpointReceipt.partitionKey,
					position: {
						topic: checkpoint.topic,
						partition: checkpoint.partition,
						offset: checkpointReceipt.recordOffset,
					},
					mutation: checkpointReceipt.mutation,
				});
			}
		})
		.immediate();
};
