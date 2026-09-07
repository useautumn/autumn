import {
	isCurrentAllocation,
	subscribePartitionAllocations,
} from "./allocation/partitionAllocation.js";
import {
	startHealthRefresh,
	stopHealthRefresh,
} from "./health/partitionHealth.js";
import { clearPartitionRetries } from "./lifecycle/retryPartition.js";
import {
	detachPartitions,
	stopPartitions,
} from "./lifecycle/stopPartitions.js";
import { reportPartitionError } from "./reportPartitionError.js";
import type {
	AllocationScope,
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
		await ctx.consumer.start();
		startHealthRefresh({ ctx, state });
	} catch (cause) {
		state.status = "stopped";
		stopHealthRefresh({ state });
		state.unsubscribePartitionChanges?.();
		state.unsubscribePartitionChanges = null;
		if (state.offsetsConnected) {
			state.offsetsConnected = false;
			try {
				await ctx.partitionOffsets.disconnect();
			} catch {
				/* Keep the startup failure. */
			}
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
	const entriesToStop = detachPartitions({ state });
	const previousLifecycle = state.lifecycle;
	const stopping = stopPartitions({ entriesToStop });
	state.stopPromise = finishStop({ ctx, state, previousLifecycle, stopping });
	return state.stopPromise;
}
async function finishStop({
	ctx,
	state,
	previousLifecycle,
	stopping,
}: PartitionsScope & {
	previousLifecycle: Promise<void>;
	stopping: Promise<void>;
}): Promise<void> {
	const results = await Promise.allSettled([
		previousLifecycle,
		stopping,
		state.healthRefreshPromise,
	]);
	const errors: unknown[] = [];
	for (const result of results)
		if (result.status === "rejected") errors.push(result.reason);
	try {
		await ctx.consumer.stop();
	} catch (cause) {
		errors.push(cause);
	}
	if (state.offsetsConnected) {
		state.offsetsConnected = false;
		try {
			await ctx.partitionOffsets.disconnect();
		} catch (cause) {
			errors.push(cause);
		}
	}
	state.status = "stopped";
	if (errors.length === 1) throw errors[0];
	if (errors.length > 1)
		throw new AggregateError(
			errors,
			"Failed to stop Kafka owned partition group",
		);
}

export function requestPartitionServiceStop(scope: AllocationScope): void {
	queueMicrotask(stopIfCurrent);
	function stopIfCurrent(): void {
		void stopSafely();
	}
	async function stopSafely(): Promise<void> {
		if (!isCurrentAllocation(scope)) return;
		try {
			await stopPartitionService(scope);
		} catch (cause) {
			reportPartitionError({ ctx: scope.ctx, cause });
		}
	}
}
