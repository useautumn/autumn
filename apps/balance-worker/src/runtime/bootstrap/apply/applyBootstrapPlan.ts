import type { PartitionCheckpointV1 } from "../../../checkpoint/partitionCheckpoint.js";
import type { PartitionCheckpointRestoreMode } from "../../../state/checkpoint/restorePartitionCheckpoint.js";
import { PartitionBootstrapRefusedError } from "../partitionBootstrapErrors.js";
import type {
	PartitionBootstrapContext,
	PartitionBootstrapPlan,
	PartitionBootstrapResult,
} from "../types/partitionBootstrap.js";

export function applyBootstrapPlan({
	ctx,
	topic,
	partition,
	plan,
	signal,
}: {
	ctx: PartitionBootstrapContext;
	topic: string;
	partition: number;
	plan: PartitionBootstrapPlan;
	signal: AbortSignal;
}): PartitionBootstrapResult {
	signal.throwIfAborted();
	switch (plan.kind) {
		case "continue":
			return { kind: "continued", nextOffset: plan.nextOffset };
		case "initialize":
			ctx.stateStore.initializePartition({
				topic,
				partition,
				nextOffset: plan.nextOffset,
			});
			return { kind: "initialized", nextOffset: plan.nextOffset };
		case "restore":
			restoreCheckpoint({ ctx, checkpoint: plan.checkpoint, mode: "restore" });
			return { kind: "restored", nextOffset: plan.checkpoint.nextOffset };
		case "replace":
			restoreCheckpoint({ ctx, checkpoint: plan.checkpoint, mode: "replace" });
			return { kind: "replaced", nextOffset: plan.checkpoint.nextOffset };
		case "refuse":
			throw new PartitionBootstrapRefusedError({
				topic,
				partition,
				reason: plan.reason,
			});
	}
}

function restoreCheckpoint({
	ctx,
	checkpoint,
	mode,
}: {
	ctx: PartitionBootstrapContext;
	checkpoint: PartitionCheckpointV1;
	mode: PartitionCheckpointRestoreMode;
}): void {
	ctx.stateStore.restorePartitionCheckpoint({
		checkpoint,
		mode,
		limits: ctx.restoreLimits,
		partitionResolver: ctx.partitionResolver,
	});
}
