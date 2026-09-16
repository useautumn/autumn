import {
	type PreparedPartitionCheckpoint,
	preparePartitionCheckpoint,
} from "../../../checkpoint/partitionCheckpoint.js";
import {
	assertPartitionCheckpointLimits,
	assertPartitionCheckpointWithinLimit,
	type PartitionCheckpointLimits,
} from "../../../checkpoint/partitionCheckpointLimits.js";
import { readPartitionReceipts } from "../../repos/mutationReceipts/mutationReceipts.js";
import { readNextOffset } from "../../repos/partitionProgress.js";
import { readPartitionStates } from "../../repos/subjectStates/subjectStates.js";
import { PartitionProgressNotFoundError } from "../../stateStoreErrors.js";
import type { StateStoreContext } from "../../types/stateStoreContext.js";

export type PartitionCheckpointCaptureLimits = PartitionCheckpointLimits;

const probeLimitOf = ({ limit }: { limit: number }): number =>
	limit === Number.MAX_SAFE_INTEGER ? limit : limit + 1;

export const capturePartitionCheckpoint = ({
	ctx,
	topic,
	partition,
	createdAt,
	limits,
	consumedNextOffset = null,
}: {
	ctx: StateStoreContext;
	topic: string;
	partition: number;
	createdAt: number;
	limits: PartitionCheckpointCaptureLimits;
	consumedNextOffset?: bigint | null;
}): PreparedPartitionCheckpoint => {
	if (!Number.isSafeInteger(createdAt) || createdAt < 0) {
		throw new RangeError("createdAt must be a non-negative safe integer");
	}
	assertPartitionCheckpointLimits({ limits });
	if (consumedNextOffset !== null && consumedNextOffset < 0n) {
		throw new RangeError("Consumed next offset cannot be negative");
	}

	const cut = ctx.sqliteDb
		.transaction(() => {
			const nextOffset = readNextOffset({ ctx, topic, partition });
			if (nextOffset === null) {
				throw new PartitionProgressNotFoundError({ topic, partition });
			}
			const states = readPartitionStates({
				ctx,
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
				ctx,
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
	const checkpoint = preparePartitionCheckpoint({
		checkpoint: {
			engineSchemaVersion: 1,
			createdAt,
			topic,
			partition,
			nextOffset:
				consumedNextOffset !== null && consumedNextOffset > cut.nextOffset
					? consumedNextOffset
					: cut.nextOffset,
			states: cut.states.map(({ partitionKey, state }) => ({
				partitionKey,
				state,
			})),
			receipts: cut.receipts,
		},
	});
	assertPartitionCheckpointWithinLimit({
		limitName: "serialized_bytes",
		limit: limits.maxSerializedBytes,
		observed: checkpoint.serializedBytes,
	});
	return checkpoint;
};
