import {
	ownedPartitionFailureReasonOf,
	ownedPartitionHealthOf,
} from "../../health/ownedPartitionHealth.js";
import { respondToPartitionFailure } from "../health/partitionHealthChecks.js";
import { reportPartitionError } from "../reportPartitionError.js";
import type {
	AllocationScope,
	PartitionEntry,
} from "../types/partitionState.js";
import { clearPartitionRetry } from "./retryPartition.js";

export function createPartitionEntries({
	ctx,
	state,
	allocationGeneration,
	partitions,
}: AllocationScope & {
	partitions: number[];
}): PartitionEntry[] {
	const { topic } = ctx.config;
	const entries: PartitionEntry[] = [];
	for (const partition of partitions) {
		try {
			clearPartitionRetry({ state, partition });
			state.terminalHealthByPartition.delete(partition);
			state.retiringEntries.delete(partition);
			const resources = ctx.createRuntime({ topic, partition });
			const entry: PartitionEntry = {
				partition,
				...resources,
				startupSettled: false,
			};
			entries.push(entry);
			state.entries.set(partition, entry);
		} catch (cause) {
			reportPartitionError({ ctx, cause });
			const progress = ctx.progress.readProgress({ topic, partition });
			respondToPartitionFailure({
				ctx,
				state,
				partition,
				cause,
				allocationGeneration,
				health: ownedPartitionHealthOf({
					topic,
					partition,
					status: "recovery_required",
					...progress,
					failureReason: ownedPartitionFailureReasonOf({ cause }),
				}),
			});
		}
	}
	return entries;
}

export async function startPartition({
	entry,
}: {
	entry: PartitionEntry;
}): Promise<void> {
	try {
		await entry.runtime.start();
	} finally {
		entry.startupSettled = true;
	}
}

export function reportPartitionStartupFailures({
	ctx,
	state,
	entries,
	results,
	allocationGeneration,
}: AllocationScope & {
	entries: PartitionEntry[];
	results: PromiseSettledResult<void>[];
}): void {
	for (const [index, result] of results.entries()) {
		if (result.status !== "rejected") continue;
		reportPartitionError({ ctx, cause: result.reason });
		const entry = entries[index];
		if (!entry) continue;
		respondToPartitionFailure({
			ctx,
			state,
			partition: entry.partition,
			entry,
			cause: result.reason,
			health: entry.runtime.getHealth(),
			allocationGeneration,
		});
	}
}
