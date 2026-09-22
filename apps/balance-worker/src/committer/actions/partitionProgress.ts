import {
	assertOffset,
	assertPartition,
	assertTopic,
} from "../../state/assertKafkaPosition.js";
import {
	ConflictingPartitionInitializationError,
	PartitionProgressNotFoundError,
} from "../../state/stateStoreErrors.js";
import type { PartitionPosition } from "../types/committer.js";
import type { CommitterStateStoreContext } from "../types/committerStateStoreContext.js";

/** Fills the mirror from Postgres; nothing to fill means the partition has never been bookmarked. */
export const loadProgress = async ({
	ctx,
	...position
}: { ctx: CommitterStateStoreContext } & PartitionPosition): Promise<void> => {
	const stored = await ctx.db.readPartitionProgress(position);
	if (!stored) return;
	ctx.progress.setNextOffset({ ...position, nextOffset: stored.nextOffset });
	if (stored.commandNextOffset !== null)
		ctx.progress.setCommandNextOffset({
			...position,
			commandNextOffset: stored.commandNextOffset,
		});
};

/** Creates the bookmark once; the same offset again is a no-op, a different one is a conflict. */
export const initializePartition = async ({
	ctx,
	topic,
	partition,
	nextOffset,
}: {
	ctx: CommitterStateStoreContext;
	nextOffset: bigint;
} & PartitionPosition): Promise<void> => {
	assertTopic({ topic });
	assertPartition({ partition });
	assertOffset({ offset: nextOffset });
	const existing = ctx.progress.readNextOffset({ topic, partition });
	if (existing === nextOffset) return;
	if (existing !== null) {
		throw new ConflictingPartitionInitializationError({ topic, partition });
	}
	await ctx.db.insertPartitionProgress({ topic, partition, nextOffset });
	ctx.progress.setNextOffset({ topic, partition, nextOffset });
};

export async function advanceCommandNextOffset({
	ctx,
	...position
}: {
	ctx: CommitterStateStoreContext;
} & PartitionPosition & { commandNextOffset: bigint }): Promise<void> {
	assertOffset({ offset: position.commandNextOffset });
	const current = ctx.progress.readCommandNextOffset(position);
	if (current !== null && current >= position.commandNextOffset) return;
	const expectedOffset = ctx.progress.readNextOffset(position);
	if (expectedOffset === null)
		throw new PartitionProgressNotFoundError(position);
	await ctx.committer.apply({ ...position, expectedOffset, records: [] });
	ctx.progress.setCommandNextOffset(position);
}
