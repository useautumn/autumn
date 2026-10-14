import {
	assertOffset,
	assertPartition,
	assertTopic,
} from "../../state/assertKafkaPosition.js";
import {
	ConflictingPartitionInitializationError,
	PartitionProgressNotFoundError,
} from "../../state/stateStoreErrors.js";
import type { OwnerFence } from "../../state/types/stateStore.js";
import type { PartitionPosition } from "../types/committer.js";
import type { CommitterStateStoreContext } from "../types/committerStateStoreContext.js";

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
	if (stored.ownerFence !== null)
		ctx.progress.setOwnerFence({ ...position, fence: stored.ownerFence });
};

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
	await ctx.db.insertPartitionProgress({
		topic,
		partition,
		nextOffset,
		claimToken: ctx.claimTokenOf({ topic, partition }),
	});
	ctx.progress.setNextOffset({ topic, partition, nextOffset });
};

export async function advanceOwnerFence({
	ctx,
	fence,
	claimToken,
	...position
}: {
	ctx: CommitterStateStoreContext;
	fence: OwnerFence;
	claimToken?: string;
} & PartitionPosition): Promise<void> {
	assertOffset({ offset: fence.offset });
	if (fence.epoch < 0n)
		throw new RangeError(`Invalid owner epoch: ${fence.epoch}`);
	const current = ctx.progress.readOwnerFence(position);
	if (current !== null && current.epoch >= fence.epoch) return;
	const expectedOffset = ctx.progress.readNextOffset(position);
	if (expectedOffset === null)
		throw new PartitionProgressNotFoundError(position);
	await ctx.committer.apply({
		...position,
		expectedOffset,
		claimToken,
		records: [],
		ownerFence: fence,
	});
	ctx.progress.setOwnerFence({ ...position, fence });
}

export async function advanceCommandNextOffset({
	ctx,
	claimToken,
	...position
}: {
	ctx: CommitterStateStoreContext;
	claimToken?: string;
} & PartitionPosition & { commandNextOffset: bigint }): Promise<void> {
	assertOffset({ offset: position.commandNextOffset });
	const current = ctx.progress.readCommandNextOffset(position);
	if (current !== null && current >= position.commandNextOffset) return;
	const expectedOffset = ctx.progress.readNextOffset(position);
	if (expectedOffset === null)
		throw new PartitionProgressNotFoundError(position);
	await ctx.committer.apply({
		...position,
		expectedOffset,
		claimToken,
		records: [],
	});
	ctx.progress.setCommandNextOffset(position);
}
