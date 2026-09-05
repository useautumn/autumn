import { clearPartitionRetries } from "../lifecycle/retryPartition.js";
import { startPartitions } from "../lifecycle/startPartitions.js";
import {
	detachPartitions,
	withdrawPartitions,
} from "../lifecycle/stopPartitions.js";
import { stopPartitionService } from "../partitionService.js";
import { reportPartitionError } from "../reportPartitionError.js";
import type {
	AllocationScope,
	PartitionEntry,
	PartitionsScope,
	PartitionsState,
} from "../types/partitionState.js";
import type {
	PartitionAllocation,
	PartitionFailure,
	PartitionRevocation,
} from "../types/partitions.js";

export function subscribePartitionAllocations({
	ctx,
	state,
}: PartitionsScope): void {
	function onAssigned(change: PartitionAllocation): void {
		applyAllocation({ ctx, state, change });
	}
	function onRevoked(revocation: PartitionRevocation): void {
		revokeAllocation({ ctx, state, revocation });
	}
	function onCrashed(failure: PartitionFailure): void {
		crashAllocation({ ctx, state, failure });
	}
	function onError({ cause }: PartitionFailure): void {
		if (state.status === "running") reportPartitionError({ ctx, cause });
	}
	state.unsubscribePartitionChanges = ctx.subscribePartitionChanges({
		onAssigned,
		onRevoked,
		onCrashed,
		onError,
	});
}
function applyAllocation({
	ctx,
	state,
	change,
}: PartitionsScope & { change: PartitionAllocation }): void {
	if (state.status !== "running") return;
	if (change.partitions.length) {
		try {
			ctx.consumer.pause({
				topic: ctx.config.topic,
				partitions: change.partitions,
			});
		} catch (cause) {
			reportPartitionError({ ctx, cause });
		}
	}
	for (const partition of state.terminalHealthByPartition.keys()) {
		if (!change.partitions.includes(partition))
			state.terminalHealthByPartition.delete(partition);
	}
	clearPartitionRetries({ state });
	const allocationGeneration = ++state.generation;
	const entriesToStop = detachPartitions({ state, revocation: change });
	const retirement = retireAllocation({ ctx, state, entriesToStop });
	state.lifecycle = startAfterRetirement({
		ctx,
		state,
		allocationGeneration,
		partitions: change.partitions,
		retirement,
	});
}
function revokeAllocation({
	ctx,
	state,
	revocation,
}: PartitionsScope & { revocation: PartitionRevocation }): void {
	if (state.status !== "running") return;
	clearPartitionRetries({ state });
	state.generation += 1;
	const entriesToStop = detachPartitions({ state, revocation });
	state.lifecycle = retireAllocation({ ctx, state, entriesToStop });
}
function crashAllocation({
	ctx,
	state,
	failure,
}: PartitionsScope & { failure: PartitionFailure }): void {
	if (state.status !== "running") return;
	clearPartitionRetries({ state });
	state.generation += 1;
	const entriesToStop = detachPartitions({ state, failure });
	reportPartitionError({ ctx, cause: failure.cause });
	state.lifecycle = retireAllocation({ ctx, state, entriesToStop });
}
async function startAfterRetirement({
	ctx,
	state,
	allocationGeneration,
	partitions,
	retirement,
}: AllocationScope & {
	partitions: number[];
	retirement: Promise<void>;
}): Promise<void> {
	try {
		await retirement;
		if (isCurrentAllocation({ state, allocationGeneration }))
			state.retiringEntries.clear();
		await startPartitions({ ctx, state, allocationGeneration, partitions });
	} catch (cause) {
		reportPartitionError({ ctx, cause });
	}
}
async function retireAllocation({
	ctx,
	state,
	entriesToStop,
}: PartitionsScope & {
	entriesToStop: PartitionEntry[];
}): Promise<void> {
	try {
		await withdrawPartitions({
			previousLifecycle: state.lifecycle,
			entriesToStop,
		});
	} catch (cause) {
		state.retirementFailed = true;
		reportPartitionError({ ctx, cause });
		function stopAfterFailure(): void {
			void stopSafely();
		}
		async function stopSafely(): Promise<void> {
			try {
				await stopPartitionService({ ctx, state });
			} catch (failure) {
				reportPartitionError({ ctx, cause: failure });
			}
		}
		queueMicrotask(stopAfterFailure);
	}
}

export function isCurrentAllocation({
	state,
	allocationGeneration,
}: {
	state: PartitionsState;
	allocationGeneration: number;
}): boolean {
	return (
		state.status === "running" &&
		!state.retirementFailed &&
		state.generation === allocationGeneration
	);
}
