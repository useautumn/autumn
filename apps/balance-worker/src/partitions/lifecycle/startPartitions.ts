import { isCurrentAllocation } from "../allocation/partitionAllocation.js";
import type { AllocationScope } from "../types/partitionState.js";
import {
	createPartitionEntries,
	reportPartitionStartupFailures,
	startPartition,
} from "./partitionStartup.js";

export async function startPartitions({
	ctx,
	state,
	allocationGeneration,
	partitions,
}: AllocationScope & {
	partitions: number[];
}): Promise<void> {
	if (!isCurrentAllocation({ state, allocationGeneration })) return;
	const entries = createPartitionEntries({
		ctx,
		state,
		allocationGeneration,
		partitions,
	});
	const startups: Promise<void>[] = [];
	for (const entry of entries) {
		entry.startup = startPartition({ state, entry, allocationGeneration });
		startups.push(entry.startup);
	}
	const results = await Promise.allSettled(startups);
	reportPartitionStartupFailures({
		ctx,
		state,
		entries,
		results,
		allocationGeneration,
	});
}
