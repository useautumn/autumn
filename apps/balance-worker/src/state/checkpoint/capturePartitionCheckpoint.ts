import type { Database } from "bun:sqlite";
import {
	createPartitionCheckpoint,
	type PartitionCheckpointV1,
	serializePartitionCheckpoint,
} from "../../checkpoint/partitionCheckpoint.js";
import {
	assertPartitionCheckpointLimits,
	assertPartitionCheckpointWithinLimit,
	type PartitionCheckpointLimits,
} from "../../checkpoint/partitionCheckpointLimits.js";
import { PartitionProgressNotFoundError } from "../sqliteBalanceStateErrors.js";
import {
	readNextOffset,
	readPartitionReceipts,
	readPartitionStates,
} from "../sqliteBalanceStateRows.js";

export type PartitionCheckpointCaptureLimits = PartitionCheckpointLimits;

const probeLimitOf = ({ limit }: { limit: number }): number =>
	limit === Number.MAX_SAFE_INTEGER ? limit : limit + 1;

export const capturePartitionCheckpoint = ({
	database,
	topic,
	partition,
	createdAt,
	limits,
}: {
	database: Database;
	topic: string;
	partition: number;
	createdAt: number;
	limits: PartitionCheckpointCaptureLimits;
}): PartitionCheckpointV1 => {
	if (!Number.isSafeInteger(createdAt) || createdAt < 0) {
		throw new RangeError("createdAt must be a non-negative safe integer");
	}
	assertPartitionCheckpointLimits({ limits });

	const cut = database
		.transaction(() => {
			const nextOffset = readNextOffset({ database, topic, partition });
			if (nextOffset === null) {
				throw new PartitionProgressNotFoundError({ topic, partition });
			}
			const states = readPartitionStates({
				database,
				topic,
				partition,
				limit: probeLimitOf({ limit: limits.maxStates }),
			});
			assertPartitionCheckpointWithinLimit({
				limitName: "states",
				limit: limits.maxStates,
				observed: states.length,
			});
			const receipts = readPartitionReceipts({
				database,
				topic,
				partition,
				createdAt,
				limit: probeLimitOf({ limit: limits.maxReceipts }),
			});
			assertPartitionCheckpointWithinLimit({
				limitName: "receipts",
				limit: limits.maxReceipts,
				observed: receipts.length,
			});
			return { nextOffset, states, receipts };
		})
		.deferred();
	const checkpoint = createPartitionCheckpoint({
		engineSchemaVersion: 1,
		createdAt,
		topic,
		partition,
		nextOffset: cut.nextOffset,
		states: cut.states.map(
			({
				partitionKey,
				initializationId,
				initializationFingerprint,
				state,
			}) => ({
				partitionKey,
				initializationId,
				initializationFingerprint,
				state,
			}),
		),
		receipts: cut.receipts,
	});
	assertPartitionCheckpointWithinLimit({
		limitName: "serialized_bytes",
		limit: limits.maxSerializedBytes,
		observed: Buffer.byteLength(
			serializePartitionCheckpoint({ checkpoint }),
			"utf8",
		),
	});
	return checkpoint;
};
