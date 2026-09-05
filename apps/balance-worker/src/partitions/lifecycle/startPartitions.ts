import { reportPartitionError } from "../reportPartitionError.js";
import type {
	AllocationScope,
	PartitionEntry,
} from "../types/partitionState.js";

export async function startPartitions({
	ctx,
	state,
	allocationGeneration,
	partitions,
}: AllocationScope & {
	partitions: number[];
}): Promise<void> {
	if (
		state.status !== "running" ||
		state.retirementFailed ||
		state.generation !== allocationGeneration
	)
		return;
	const entries: PartitionEntry[] = [];
	for (const partition of partitions) {
		try {
			const entry = {
				partition,
				...ctx.createRuntime({ topic: ctx.config.topic, partition }),
			};
			entries.push(entry);
			state.entries.set(partition, entry);
		} catch (cause) {
			reportPartitionError({ ctx, cause });
		}
	}
	const startups: Promise<void>[] = [];
	for (const entry of entries) startups.push(startPartition({ entry }));
	const results = await Promise.allSettled(startups);
	for (const result of results) {
		if (result.status === "rejected")
			reportPartitionError({ ctx, cause: result.reason });
	}
}
async function startPartition({
	entry,
}: {
	entry: PartitionEntry;
}): Promise<void> {
	await entry.runtime.start();
}
