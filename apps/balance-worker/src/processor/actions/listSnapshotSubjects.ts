import type { MeteringIdentity } from "@autumn/balance-engine";
import type { PartitionProcessorScope } from "../types/partitionProcessor.js";

/** The customer's subjects that have a snapshot row today: what an evict rebuilds, and nothing more (a subject never read stays a miss). */
export const listSnapshotSubjects = ({
	scope,
	identity,
}: {
	scope: PartitionProcessorScope;
	identity: MeteringIdentity;
}): Promise<MeteringIdentity[]> =>
	scope.ctx.db.listSubjectSnapshots({
		identity: { ...identity, entityId: null },
	});
