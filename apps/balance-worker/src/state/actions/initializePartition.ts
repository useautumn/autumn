import {
	assertOffset,
	assertPartition,
	assertTopic,
} from "../assertKafkaPosition.js";
import {
	insertPartitionProgress,
	readNextOffset,
} from "../repos/partitionProgress.js";
import { ConflictingPartitionInitializationError } from "../stateStoreErrors.js";
import type { StateStoreContext } from "../types/stateStoreContext.js";

export const initializePartition = ({
	ctx,
	topic,
	partition,
	nextOffset,
}: {
	ctx: StateStoreContext;
	topic: string;
	partition: number;
	nextOffset: bigint;
}): void => {
	assertTopic({ topic });
	assertPartition({ partition });
	assertOffset({ offset: nextOffset });

	ctx.sqliteDb
		.transaction(() => {
			const existingNextOffset = readNextOffset({ ctx, topic, partition });
			if (existingNextOffset === nextOffset) return;
			if (existingNextOffset !== null) {
				throw new ConflictingPartitionInitializationError({
					topic,
					partition,
				});
			}

			insertPartitionProgress({ ctx, topic, partition, nextOffset });
		})
		.immediate();
};
