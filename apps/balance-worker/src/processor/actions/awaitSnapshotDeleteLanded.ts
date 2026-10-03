import {
	type MeteringIdentity,
	meteringIdentityToPartitionKey,
} from "@autumn/balance-engine";
import type { PartitionProcessorScope } from "../types/partitionProcessor.js";

/**
 * Resolves once the lane tick carrying the customer's snapshot DELETE has run, so an evict answers only when a cold
 * load elsewhere can no longer find the stale row. At once on a store that keeps no snapshots.
 */
export const awaitSnapshotDeleteLanded = async ({
	scope,
	identity,
}: {
	scope: PartitionProcessorScope;
	identity: MeteringIdentity;
}): Promise<void> => {
	const { snapshotQueues } = scope.ctx.stateStore;
	if (!snapshotQueues) return;
	const customer = { ...identity, entityId: null };
	// Still resident after the drop means a commit in flight pins it: the drop, and its DELETE, follow that commit's store.
	if (scope.ctx.writer.readFreshestState({ identity: customer }))
		await scope.ctx.writer.waitForStore();
	await snapshotQueues.deleteLanded({
		topic: scope.ctx.config.topic,
		partition: scope.ctx.config.partition,
		customerKey: meteringIdentityToPartitionKey({ identity: customer }),
	});
};
