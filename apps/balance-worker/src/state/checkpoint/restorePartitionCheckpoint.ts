import type { Database } from "bun:sqlite";
import {
	assertPartitionCheckpointOwnership,
	type PartitionCheckpointPartitionResolver,
	type PartitionCheckpointV1,
	serializePartitionCheckpoint,
} from "../../checkpoint/partitionCheckpoint.js";
import {
	insertPartitionProgress,
	insertState,
	insertTrackReceipt,
	readNextOffset,
} from "../sqliteBalanceStateRows.js";

export type PartitionCheckpointRestoreMode = "replace" | "restore";

export type PartitionCheckpointRestoreLimits = {
	maxSerializedBytes: number;
	maxStates: number;
	maxReceipts: number;
};

type PartitionCheckpointLimitName = "receipts" | "serialized_bytes" | "states";

export class PartitionCheckpointLimitExceededError extends Error {
	readonly limitName: PartitionCheckpointLimitName;
	readonly limit: number;
	readonly observed: number;

	constructor({
		limitName,
		limit,
		observed,
	}: {
		limitName: PartitionCheckpointLimitName;
		limit: number;
		observed: number;
	}) {
		super(
			`Partition checkpoint ${limitName} limit ${limit} exceeded by ${observed}`,
		);
		this.name = "PartitionCheckpointLimitExceededError";
		this.limitName = limitName;
		this.limit = limit;
		this.observed = observed;
	}
}

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

const assertLimit = ({
	name,
	value,
}: {
	name: string;
	value: number;
}): void => {
	if (!Number.isSafeInteger(value) || value <= 0) {
		throw new RangeError(`${name} must be a positive safe integer`);
	}
};

const assertWithinLimit = ({
	limitName,
	limit,
	observed,
}: {
	limitName: PartitionCheckpointLimitName;
	limit: number;
	observed: number;
}): void => {
	if (observed <= limit) return;
	throw new PartitionCheckpointLimitExceededError({
		limitName,
		limit,
		observed,
	});
};

const validateCheckpoint = ({
	checkpoint,
	limits,
	partitionResolver,
}: {
	checkpoint: PartitionCheckpointV1;
	limits: PartitionCheckpointRestoreLimits;
	partitionResolver: PartitionCheckpointPartitionResolver;
}): void => {
	assertLimit({ name: "maxSerializedBytes", value: limits.maxSerializedBytes });
	assertLimit({ name: "maxStates", value: limits.maxStates });
	assertLimit({ name: "maxReceipts", value: limits.maxReceipts });
	assertWithinLimit({
		limitName: "states",
		limit: limits.maxStates,
		observed: checkpoint.states.length,
	});
	assertWithinLimit({
		limitName: "receipts",
		limit: limits.maxReceipts,
		observed: checkpoint.receipts.length,
	});
	const serializedBytes = Buffer.byteLength(
		serializePartitionCheckpoint({ checkpoint }),
		"utf8",
	);
	assertWithinLimit({
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
	database,
	checkpoint,
	mode,
	limits,
	partitionResolver,
}: {
	database: Database;
	checkpoint: PartitionCheckpointV1;
	mode: PartitionCheckpointRestoreMode;
	limits: PartitionCheckpointRestoreLimits;
	partitionResolver: PartitionCheckpointPartitionResolver;
}): void => {
	validateCheckpoint({ checkpoint, limits, partitionResolver });

	database
		.transaction(() => {
			const existingNextOffset = readNextOffset({
				database,
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
				database
					.query<never, { topic: string; partition: number }>(`
						DELETE FROM partition_progress
						WHERE topic = $topic AND partition_id = $partition
					`)
					.run({ topic: checkpoint.topic, partition: checkpoint.partition });
			}

			insertPartitionProgress({
				database,
				topic: checkpoint.topic,
				partition: checkpoint.partition,
				nextOffset: checkpoint.nextOffset,
			});
			for (const checkpointState of checkpoint.states) {
				insertState({
					database,
					partitionKey: checkpointState.partitionKey,
					topic: checkpoint.topic,
					partition: checkpoint.partition,
					initializationId: checkpointState.initializationId,
					initializationFingerprint: checkpointState.initializationFingerprint,
					state: checkpointState.state,
				});
			}
			for (const checkpointReceipt of checkpoint.receipts) {
				insertTrackReceipt({
					database,
					partitionKey: checkpointReceipt.partitionKey,
					position: {
						topic: checkpoint.topic,
						partition: checkpoint.partition,
						offset: checkpointReceipt.recordOffset,
					},
					receipt: checkpointReceipt.outcome,
				});
			}
		})
		.immediate();
};
