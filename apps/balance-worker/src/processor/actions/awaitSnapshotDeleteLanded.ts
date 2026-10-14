import {
	type MeteringIdentity,
	meteringIdentityToPartitionKey,
} from "@autumn/balance-engine";
import { writesSubjectSnapshots } from "@autumn/edge-config";
import type { DeletedSubjectSnapshot } from "@autumn/postgres";
import type { PartitionProcessorScope } from "../types/partitionProcessor.js";

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
	if (scope.ctx.writer.readFreshestState({ identity: customer }))
		await scope.ctx.writer.waitForStore();
	return snapshotQueues.deleteLanded({
		topic: scope.ctx.config.topic,
		partition: scope.ctx.config.partition,
		customerKey: meteringIdentityToPartitionKey({ identity: customer }),
	});
};
