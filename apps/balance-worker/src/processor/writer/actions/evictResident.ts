import { allStored } from "../pendingMutations.js";
import type { PartitionWriterScope } from "../types/partitionWriter.js";

/** Leaves the partition cold, as a restart would: once the store holds every write before now, every resident subject goes. */
export async function evictResident({
	scope,
}: {
	scope: PartitionWriterScope;
}): Promise<{ evicted: number; resident: number }> {
	const { subjects } = scope.state;
	await allStored({ state: scope.state });
	const evicted = subjects.dropUnpinned();
	return { evicted, resident: subjects.residentCount() };
}
