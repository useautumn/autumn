import {
	beginPartitionHandoffs,
	cancelPartitionHandoff,
} from "../lifecycle/handOffPartition.js";
import { subscribeEntryUnavailable } from "../lifecycle/partitionStartup.js";
import { clearPartitionRetries } from "../lifecycle/retryPartition.js";
import { startPartitions } from "../lifecycle/startPartitions.js";
import {
	detachPartitions,
	withdrawPartitions,
} from "../lifecycle/stopPartitions.js";
import {
	failPartitionRetirement,
	requestPartitionServiceStop,
} from "../partitionService.js";
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
	PartitionConsumerCrash,
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

	function onCrashed(crash: PartitionConsumerCrash): void {
		crashPartitionAllocation({ ctx, state, crash });
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
	discardUnallocatedHealth({ state, partitions: change.partitions });
	clearPartitionRetries({ state });
	const allocationGeneration = ++state.generation;
	const entriesToStop = detachPartitions({ state, revocation: change });
	const { partitions, blockers } = keepHandoffsForOwnPartitions({
		ctx,
		state,
		allocationGeneration,
		change,
	});
	pauseAllocatedPartitions({ ctx, partitions });
	const retirement = retireAllocation({ ctx, state, entriesToStop });
	state.lifecycle = startAllocationAfterRetirement({
		ctx,
		state,
		partitions,
		allocationGeneration,
		retirement,
		blockers,
	});
}

/** A partition assigned back to this worker never bounces: its handoff is cancelled and it keeps serving.
 *  One that already stopped serving must finish retiring before it can be started afresh. */
function keepHandoffsForOwnPartitions({
	ctx,
	state,
	allocationGeneration,
	change,
}: AllocationScope & { change: PartitionAssignment }): {
	partitions: number[];
	blockers: Promise<void>[];
} {
	const partitions: number[] = [];
	const blockers: Promise<void>[] = [];
	for (const partition of change.partitions) {
		const entry = state.handingOff.get(partition);
		if (entry && cancelPartitionHandoff({ state, entry })) {
			subscribeEntryUnavailable({ ctx, state, entry, allocationGeneration });
			continue;
		}
		if (entry?.retirement) blockers.push(entry.retirement);
		partitions.push(partition);
	}
	return { partitions, blockers };
}

function revokePartitionAllocation({
	ctx,
	state,
	revocation,
}: PartitionsScope & { revocation: PartitionRevocation }): void {
	if (state.status !== "running") return;
	clearPartitionRetries({ state });
	state.generation += 1;
	beginPartitionHandoffs({ ctx, state });
	const entriesToStop = detachPartitions({ state, revocation });
	state.lifecycle = retireAllocation({ ctx, state, entriesToStop });
}

/** A crash kafkajs will restart from rejoins and is reassigned; one it will not leaves nothing to wait for. */
function crashPartitionAllocation({
	ctx,
	state,
	crash,
}: PartitionsScope & { crash: PartitionConsumerCrash }): void {
	if (state.status !== "running") return;
	clearPartitionRetries({ state });
	const allocationGeneration = ++state.generation;
	const entriesToStop = detachPartitions({ state, failure: crash });
	reportPartitionError({ ctx, cause: crash.cause });
	state.lifecycle = retireAllocation({ ctx, state, entriesToStop });
	if (!crash.restart)
		requestPartitionServiceStop({ ctx, state, allocationGeneration });
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
		failPartitionRetirement({ ctx, state, cause });
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
		if (ctx.config.commandTopic)
			ctx.consumer.pause({ topic: ctx.config.commandTopic, partitions });
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
	blockers,
}: AllocationScope & {
	partitions: number[];
	retirement: Promise<void>;
	blockers: Promise<void>[];
}): Promise<void> {
	try {
		await retirement;
		await Promise.allSettled(blockers);
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
