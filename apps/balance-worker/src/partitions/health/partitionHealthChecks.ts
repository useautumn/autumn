import type { OwnedPartitionHealth } from "../../health/ownedPartitionHealth.js";
import { isPartitionBootstrapBlockedCause } from "../../runtime/bootstrap/partitionBootstrapErrors.js";
import { isCurrentAllocation } from "../allocation/partitionAllocation.js";
import { retryPartition } from "../lifecycle/retryPartition.js";
import { requestPartitionServiceStop } from "../partitionService.js";
import { reportPartitionError } from "../reportPartitionError.js";
import type {
	AllocationScope,
	PartitionEntry,
} from "../types/partitionState.js";

export function respondToUnhealthyPartitions({
	ctx,
	state,
	allocationGeneration,
}: AllocationScope): boolean {
	let groupStopping = false;
	for (const entry of state.entries.values()) {
		const health = entry.runtime.getHealth();
		if (health.status !== "recovery_required" || !entry.startupSettled)
			continue;
		const disposition = respondToPartitionFailure({
			ctx,
			state,
			partition: entry.partition,
			entry,
			health,
			allocationGeneration,
			cause: new Error(
				health.failureReason ??
					`Owned partition ${ctx.config.topic}[${entry.partition}] is unhealthy`,
			),
		});
		if (disposition === "group_stopping") groupStopping = true;
	}
	return groupStopping;
}

export async function refreshPartitionHighWatermarks({
	ctx,
	state,
	allocationGeneration,
}: AllocationScope): Promise<boolean> {
	const { topic } = ctx.config;
	const offsets = await ctx.partitionOffsets.fetchHighWatermarks({ topic });
	if (!isCurrentAllocation({ state, allocationGeneration })) return false;
	for (const entry of state.entries.values()) {
		ctx.progress.observeHighWatermark({
			topic,
			partition: entry.partition,
			highWatermark: offsets.readHighWatermark({ partition: entry.partition }),
		});
	}
	return true;
}

export function respondToPartitionFailure({
	ctx,
	state,
	partition,
	cause,
	health,
	allocationGeneration,
	entry,
}: AllocationScope & {
	partition: number;
	cause: unknown;
	health: OwnedPartitionHealth;
	entry?: PartitionEntry;
}): "group_stopping" | "ignored" | "partition_parked" {
	if (
		!isCurrentAllocation({ state, allocationGeneration }) ||
		(entry !== undefined && state.entries.get(partition) !== entry) ||
		state.terminalHealthByPartition.has(partition)
	)
		return "ignored";
	state.terminalHealthByPartition.set(partition, health);
	try {
		ctx.onUnhealthyPartition({ topic: ctx.config.topic, partition, cause });
	} catch (callbackCause) {
		reportPartitionError({ ctx, cause: callbackCause });
	}
	if (isPartitionBootstrapBlockedCause({ cause })) {
		retryPartition({ ctx, state, partition, entry, allocationGeneration });
		return "partition_parked";
	}
	requestPartitionServiceStop({ ctx, state, allocationGeneration });
	return "group_stopping";
}
