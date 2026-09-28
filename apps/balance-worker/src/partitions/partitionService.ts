import {
	isCurrentAllocation,
	subscribePartitionAllocations,
} from "./allocation/partitionAllocation.js";
import {
	startHealthRefresh,
	stopHealthRefresh,
} from "./health/partitionHealth.js";
import { beginPartitionHandoffs } from "./lifecycle/handOffPartition.js";
import { clearPartitionRetries } from "./lifecycle/retryPartition.js";
import {
	detachPartitions,
	stopPartitions,
} from "./lifecycle/stopPartitions.js";
import { reportPartitionError } from "./reportPartitionError.js";
import type {
	AllocationScope,
	PartitionEntry,
	PartitionsScope,
} from "./types/partitionState.js";

export async function startPartitionService({
	ctx,
	state,
}: PartitionsScope): Promise<void> {
	if (state.status !== "created")
		throw new Error(
			`Kafka owned partition group cannot start while ${state.status}`,
		);
	state.status = "running";
	subscribePartitionAllocations({ ctx, state });
	try {
		await ctx.partitionOffsets.connect();
		state.offsetsConnected = true;
		await ctx.ownershipLink?.start();
		state.ownershipLinked = true;
		await ctx.consumer.start();
		startHealthRefresh({ ctx, state });
	} catch (cause) {
		state.status = "stopped";
		stopHealthRefresh({ state });
		state.unsubscribePartitionChanges?.();
		state.unsubscribePartitionChanges = null;
		try {
			await disconnectPartitionResources({ ctx, state });
		} catch {
			// Keep the original startup failure.
		}
		throw cause;
	}
}

export function stopPartitionService({
	ctx,
	state,
}: PartitionsScope): Promise<void> {
	if (state.stopPromise) return state.stopPromise;
	if (state.status === "stopped") return Promise.resolve();
	if (state.status === "created") {
		state.status = "stopped";
		return Promise.resolve();
	}
	state.status = "stopping";
	stopHealthRefresh({ state });
	clearPartitionRetries({ state });
	state.generation += 1;
	state.unsubscribePartitionChanges?.();
	state.unsubscribePartitionChanges = null;

	// Serving partitions keep serving until a successor is ready; the rest stop as before.
	const handingOff = [
		...state.handingOff.values(),
		...beginPartitionHandoffs({ ctx, state }),
	];
	const entriesToStop = [...handingOff, ...detachPartitions({ state })];
	const previousLifecycle = state.lifecycle;
	const healthRefresh = state.healthRefreshPromise;
	state.stopPromise = finishPartitionServiceStop({
		ctx,
		state,
		previousLifecycle,
		healthRefresh,
		entriesToStop,
	});
	return state.stopPromise;
}

async function disconnectPartitionResources({
	ctx,
	state,
}: PartitionsScope): Promise<void> {
	const errors: unknown[] = [];
	if (state.ownershipLinked) {
		state.ownershipLinked = false;
		try {
			await ctx.ownershipLink?.stop();
		} catch (cause) {
			errors.push(cause);
		}
	}
	if (state.offsetsConnected) {
		state.offsetsConnected = false;
		try {
			await ctx.partitionOffsets.disconnect();
		} catch (cause) {
			errors.push(cause);
		}
	}
	if (errors.length === 1) throw errors[0];
	if (errors.length > 1)
		throw new AggregateError(errors, "Partition resources did not disconnect");
}

export function requestPartitionServiceStop({
	ctx,
	state,
	allocationGeneration,
}: AllocationScope): void {
	function stopCurrentAllocation(): void {
		if (!isCurrentAllocation({ state, allocationGeneration })) return;
		void stopServiceThenNotify({ ctx, state });
	}
	queueMicrotask(stopCurrentAllocation);
}

/** The worker owns nothing after this and never will again: the entrypoint is told so the process can end. */
export async function stopServiceThenNotify({
	ctx,
	state,
}: PartitionsScope): Promise<void> {
	await stopPartitionServiceSafely({ ctx, state });
	try {
		ctx.onServiceStopped?.();
	} catch (cause) {
		reportPartitionError({ ctx, cause });
	}
}

/** No later assignment may reuse a half-retired runtime, so this worker is finished. */
export function failPartitionRetirement({
	ctx,
	state,
	cause,
}: PartitionsScope & { cause: unknown }): void {
	state.retirementFailed = true;
	reportPartitionError({ ctx, cause });
	function stopAfterRetirementFailure(): void {
		void stopServiceThenNotify({ ctx, state });
	}
	queueMicrotask(stopAfterRetirementFailure);
}

export async function stopPartitionServiceSafely({
	ctx,
	state,
}: PartitionsScope): Promise<void> {
	try {
		await stopPartitionService({ ctx, state });
	} catch (cause) {
		reportPartitionError({ ctx, cause });
	}
}

async function finishPartitionServiceStop({
	ctx,
	state,
	previousLifecycle,
	healthRefresh,
	entriesToStop,
}: PartitionsScope & {
	previousLifecycle: Promise<void>;
	healthRefresh: Promise<void> | null;
	entriesToStop: PartitionEntry[];
}): Promise<void> {
	const errors: unknown[] = [];
	// Leave the group first: successors are assigned and prepare while this worker still serves.
	try {
		await ctx.consumer.stop();
	} catch (cause) {
		errors.push(cause);
	}
	const results = await Promise.allSettled([
		previousLifecycle,
		stopPartitions({ ctx, entriesToStop }),
		healthRefresh,
	]);
	for (const result of results) {
		if (result.status === "rejected") errors.push(result.reason);
	}
	try {
		await disconnectPartitionResources({ ctx, state });
	} catch (cause) {
		errors.push(cause);
	}
	state.status = "stopped";
	if (errors.length === 1) throw errors[0];
	if (errors.length > 1)
		throw new AggregateError(
			errors,
			"Failed to stop Kafka owned partition group",
		);
}
