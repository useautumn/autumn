import { applyBootstrapPlan } from "./apply/applyBootstrapPlan.js";
import { planPartitionBootstrap } from "./plan/planPartitionBootstrap.js";
import { loadPartitionCheckpoint } from "./read/loadPartitionCheckpoint.js";
import {
	readBootstrapProgress,
	readBootstrapState,
} from "./read/readBootstrapState.js";
import type {
	PartitionBootstrapParams,
	PartitionBootstrapResult,
} from "./types/partitionBootstrap.js";

export async function bootstrapPartition({
	ctx,
	topic,
	partition,
	logRange,
	signal,
}: PartitionBootstrapParams): Promise<PartitionBootstrapResult> {
	const progress = readBootstrapProgress({
		ctx,
		topic,
		partition,
		logRange,
		signal,
	});
	const loadedCheckpoint = progress.needsCheckpoint
		? await loadPartitionCheckpoint({ ctx, topic, partition, signal })
		: null;

	// Keep the final state read, plan, and apply synchronous after checkpoint loading.
	const state = readBootstrapState({
		ctx,
		topic,
		partition,
		logRange,
		signal,
		progress,
		loadedCheckpoint,
	});
	const plan = planPartitionBootstrap(state);
	return applyBootstrapPlan({ ctx, topic, partition, plan, signal });
}
