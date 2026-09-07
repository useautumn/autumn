import { clearPartitionRetries } from "../lifecycle/retryPartition.js";
import { startPartitions } from "../lifecycle/startPartitions.js";
import {
	detachPartitions,
	withdrawPartitions,
} from "../lifecycle/stopPartitions.js";
import { stopPartitionServiceSafely } from "../partitionService.js";
import { reportPartitionError } from "../reportPartitionError.js";
import type {
	AllocationScope,
	PartitionEntry,
	PartitionsContext,
	PartitionsScope,
	PartitionsState,
} from "../types/partitionState.js";
import type {
	PartitionAssignment,
	PartitionFailure,
	PartitionRevocation,
} from "../types/partitions.js";

export function subscribePartitionAllocations({
	ctx,
	state,
}: PartitionsScope): void {
	function onAssigned(change: PartitionAssignment): void {
		applyPartitionAllocation({ ctx, state, change });
	}

	function onRevoked(revocation: PartitionRevocation): void {
		revokePartitionAllocation({ ctx, state, revocation });
	}

	function onCrashed(failure: PartitionFailure): void {
		crashPartitionAllocation({ ctx, state, failure });
	}

	function onError(failure: PartitionFailure): void {
		if (state.status !== "running") return;
		reportPartitionError({ ctx, cause: failure.cause });
	}

	state.unsubscribePartitionChanges = ctx.subscribePartitionChanges({
		onAssigned,
		onRevoked,
		onCrashed,
		onError,
	});
}

function applyPartitionAllocation({
	ctx,
	state,
	change,
}: PartitionsScope & { change: PartitionAssignment }): void {
	if (state.status !== "running") return;
	const { partitions } = change;
	discardUnallocatedHealth({ state, partitions });
	pauseAllocatedPartitions({ ctx, partitions });
	clearPartitionRetries({ state });
	const allocationGeneration = ++state.generation;
	const entriesToStop = detachPartitions({ state, revocation: change });
	const retirement = retireAllocation({ ctx, state, entriesToStop });
	state.lifecycle = startAllocationAfterRetirement({
		ctx,
		state,
		partitions,
		allocationGeneration,
		retirement,
	});
}

function revokePartitionAllocation({
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

function crashPartitionAllocation({
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

async function retireAllocation({
	ctx,
	state,
	entriesToStop,
}: PartitionsScope & {
	entriesToStop: PartitionEntry[];
}): Promise<void> {
	try {
		await withdrawPartitions({
			ctx,
			previousLifecycle: state.lifecycle,
			entriesToStop,
		});
	} catch (cause) {
		state.retirementFailed = true;
		reportPartitionError({ ctx, cause });
		function stopAfterRetirementFailure(): void {
			void stopPartitionServiceSafely({ ctx, state });
		}
		queueMicrotask(stopAfterRetirementFailure);
	}
}

function discardUnallocatedHealth({
	state,
	partitions,
}: {
	state: PartitionsState;
	partitions: number[];
}): void {
	for (const partition of state.terminalHealthByPartition.keys()) {
		if (!partitions.includes(partition))
			state.terminalHealthByPartition.delete(partition);
	}
}

function pauseAllocatedPartitions({
	ctx,
	partitions,
}: {
	ctx: PartitionsContext;
	partitions: number[];
}): void {
	if (partitions.length === 0) return;
	try {
		ctx.consumer.pause({ topic: ctx.config.topic, partitions });
	} catch (cause) {
		reportPartitionError({ ctx, cause });
	}
}

async function startAllocationAfterRetirement({
	ctx,
	state,
	partitions,
	allocationGeneration,
	retirement,
}: AllocationScope & {
	partitions: number[];
	retirement: Promise<void>;
}): Promise<void> {
	try {
		await retirement;
		if (isCurrentAllocation({ state, allocationGeneration }))
			state.retiringEntries.clear();
		await startPartitions({
			ctx,
			state,
			allocationGeneration,
			partitions,
		});
	} catch (cause) {
		reportPartitionError({ ctx, cause });
	}
}
