import type {
	PartitionEntry,
	PartitionsState,
} from "../types/partitionState.js";
import type {
	PartitionFailure,
	PartitionRevocation,
} from "../types/partitions.js";

export function detachPartitions({
	state,
	revocation,
	failure,
}: {
	state: PartitionsState;
	revocation?: PartitionRevocation;
	failure?: PartitionFailure;
}): PartitionEntry[] {
	const entries = [...state.entries.values()];
	state.entries.clear();
	for (const entry of entries) {
		state.retiringEntries.set(entry.partition, entry);
		if (failure) entry.markUnavailable(failure);
		else if (revocation)
			entry.markUnavailable({
				cause: revocation.causeForPartition({ partition: entry.partition }),
			});
	}
	return entries;
}
export async function stopPartitions({
	entriesToStop,
}: {
	entriesToStop: PartitionEntry[];
}): Promise<void> {
	const stops: Promise<void>[] = [];
	for (const entry of entriesToStop) stops.push(stopPartition({ entry }));
	const results = await Promise.allSettled(stops);
	const failures: unknown[] = [];
	for (const result of results) {
		if (result.status === "rejected") failures.push(result.reason);
	}
	if (failures.length)
		throw new AggregateError(
			failures,
			"Partition retirement did not settle safely",
		);
}
async function stopPartition({
	entry,
}: {
	entry: PartitionEntry;
}): Promise<void> {
	try {
		await entry.runtime.stop();
	} finally {
		await entry.runtime.waitForQuiescence();
	}
}
export async function withdrawPartitions({
	previousLifecycle,
	entriesToStop,
}: {
	previousLifecycle: Promise<void>;
	entriesToStop: PartitionEntry[];
}): Promise<void> {
	const results = await Promise.allSettled([
		previousLifecycle,
		stopPartitions({ entriesToStop }),
	]);
	for (const result of results) {
		if (result.status === "rejected") throw result.reason;
	}
}
