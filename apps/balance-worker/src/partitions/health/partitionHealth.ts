import type { OwnedPartitionHealth } from "../../health/ownedPartitionHealth.js";
import { isCurrentAllocation } from "../allocation/partitionAllocation.js";
import { reportPartitionError } from "../reportPartitionError.js";
import type {
	AllocationScope,
	PartitionsScope,
	PartitionsState,
} from "../types/partitionState.js";
import type { PartitionRuntimePort } from "../types/partitions.js";
import {
	refreshPartitionHighWatermarks,
	respondToUnhealthyPartitions,
} from "./partitionHealthChecks.js";

async function refreshPartitionHealth(
	allocation: AllocationScope,
): Promise<void> {
	if (!isCurrentAllocation(allocation) || allocation.state.entries.size === 0)
		return;
	if (respondToUnhealthyPartitions(allocation)) return;

	const refreshed = await refreshPartitionHighWatermarks(allocation);
	if (!refreshed) return;

	respondToUnhealthyPartitions(allocation);
}

export function startHealthRefresh({ ctx, state }: PartitionsScope): void {
	state.healthRefreshTimer = setInterval(
		refreshHealthWhenIdle,
		ctx.config.healthRefreshIntervalMs,
		{ ctx, state },
	);
	state.healthRefreshTimer.unref?.();
}

export function stopHealthRefresh({ state }: { state: PartitionsState }): void {
	if (state.healthRefreshTimer) clearInterval(state.healthRefreshTimer);
	state.healthRefreshTimer = null;
}

function refreshHealthWhenIdle({ ctx, state }: PartitionsScope): void {
	if (state.healthRefreshPromise) return;
	state.healthRefreshPromise = refreshHealthSafely({ ctx, state });
}

async function refreshHealthSafely({
	ctx,
	state,
}: PartitionsScope): Promise<void> {
	try {
		await refreshPartitionHealth({
			ctx,
			state,
			allocationGeneration: state.generation,
		});
	} catch (cause) {
		reportPartitionError({ ctx, cause });
	} finally {
		state.healthRefreshPromise = null;
	}
}

export function listPartitionHealth({
	state,
}: {
	state: PartitionsState;
}): OwnedPartitionHealth[] {
	const health = new Map<number, OwnedPartitionHealth>();
	for (const entry of state.retiringEntries.values())
		health.set(entry.partition, reportedHealthOf({ runtime: entry.runtime }));
	for (const entry of state.handingOff.values())
		health.set(entry.partition, reportedHealthOf({ runtime: entry.runtime }));
	for (const [partition, terminal] of state.terminalHealthByPartition)
		health.set(partition, terminal);
	for (const entry of state.entries.values())
		health.set(entry.partition, reportedHealthOf({ runtime: entry.runtime }));
	return [...health.values()].sort(comparePartitionHealth);
}

export function reportedHealthOf({
	runtime,
}: {
	runtime: Pick<PartitionRuntimePort, "getHealth" | "readSubjectMapUsage">;
}): OwnedPartitionHealth {
	const health = runtime.getHealth();
	const subjectMap = runtime.readSubjectMapUsage?.();
	return subjectMap ? { ...health, subjectMap } : health;
}

function comparePartitionHealth(
	left: OwnedPartitionHealth,
	right: OwnedPartitionHealth,
): number {
	return left.partition - right.partition;
}
