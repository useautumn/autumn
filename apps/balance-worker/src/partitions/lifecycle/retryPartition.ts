import { isCurrentAllocation } from "../allocation/partitionAllocation.js";
import { requestPartitionServiceStop } from "../partitionService.js";
import { reportPartitionError } from "../reportPartitionError.js";
import type {
	AllocationScope,
	PartitionCleanupResult,
	PartitionEntry,
	PartitionRetry,
	PartitionsState,
} from "../types/partitionState.js";
import { startPartitions } from "./startPartitions.js";

export function retryPartition({
	ctx,
	state,
	partition,
	entry,
	allocationGeneration,
}: AllocationScope & {
	partition: number;
	entry?: PartitionEntry;
}): void {
	if (state.partitionRetryTimers.has(partition)) return;
	const cleanup = cleanUpPartitionForRetry({ entry });
	const timer = setTimeout(
		retryPartitionWhenDue,
		ctx.config.partitionBootstrapRetryIntervalMs,
		{ ctx, state, partition, entry, allocationGeneration, cleanup },
	);
	timer.unref?.();
	state.partitionRetryTimers.set(partition, timer);
}

export function clearPartitionRetry({
	state,
	partition,
}: {
	state: PartitionsState;
	partition: number;
}): void {
	const timer = state.partitionRetryTimers.get(partition);
	if (!timer) return;
	clearTimeout(timer);
	state.partitionRetryTimers.delete(partition);
}

export function clearPartitionRetries({
	state,
}: {
	state: PartitionsState;
}): void {
	for (const timer of state.partitionRetryTimers.values()) clearTimeout(timer);
	state.partitionRetryTimers.clear();
}

async function cleanUpPartitionForRetry({
	entry,
}: {
	entry?: PartitionEntry;
}): Promise<PartitionCleanupResult> {
	try {
		if (entry) {
			await entry.runtime.stop();
			await entry.runtime.waitForQuiescence();
		}
		return { ok: true };
	} catch (cause) {
		return { ok: false, cause };
	}
}

async function retryPartitionWhenDue(retry: PartitionRetry): Promise<void> {
	const { ctx, state, partition, allocationGeneration } = retry;
	state.partitionRetryTimers.delete(partition);
	try {
		await retryPartitionAfterCleanup(retry);
	} catch (cause) {
		reportPartitionError({ ctx, cause });
		requestPartitionServiceStop({ ctx, state, allocationGeneration });
	}
}

async function retryPartitionAfterCleanup({
	ctx,
	state,
	partition,
	entry,
	allocationGeneration,
	cleanup,
}: PartitionRetry): Promise<void> {
	const result = await cleanup;
	if (!result.ok) {
		reportPartitionError({ ctx, cause: result.cause });
		requestPartitionServiceStop({ ctx, state, allocationGeneration });
		return;
	}
	if (
		!isCurrentAllocation({ state, allocationGeneration }) ||
		(entry !== undefined && state.entries.get(partition) !== entry)
	)
		return;
	state.entries.delete(partition);
	await startPartitions({
		ctx,
		state,
		allocationGeneration,
		partitions: [partition],
	});
}
