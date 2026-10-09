import {
	type MeteringIdentity,
	meteringIdentityToPartitionKey,
} from "@autumn/balance-engine";
import { writesSubjectSnapshots } from "@autumn/edge-config";
import type { DeletedSubjectSnapshot } from "@autumn/postgres";
import type { PartitionProcessorScope } from "../types/partitionProcessor.js";

/**
 * The rows the customer's snapshot DELETE removed, once the lane tick carrying it has run, so an evict answers only when
 * a cold load elsewhere can no longer find a stale row. None, at once, on a store that keeps no snapshots or while off.
 */
export const awaitSnapshotDeleteLanded = async ({
	scope,
	identity,
}: {
	scope: PartitionProcessorScope;
	identity: MeteringIdentity;
}): Promise<DeletedSubjectSnapshot[]> => {
	const { snapshotQueues } = scope.ctx.stateStore;
	const settings = scope.ctx.subjectSnapshotsConfig?.get();
	if (!snapshotQueues || !settings || !writesSubjectSnapshots(settings))
		return [];
	const customer = { ...identity, entityId: null };
	// Still resident after the drop means an unapplied write pins it: the drop, and its DELETE, follow that write's store.
	if (scope.ctx.writer.readFreshestState({ identity: customer }))
		await scope.ctx.writer.waitForStore();
	return snapshotQueues.deleteLanded({
		topic: scope.ctx.config.topic,
		partition: scope.ctx.config.partition,
		customerKey: meteringIdentityToPartitionKey({ identity: customer }),
	});
};
