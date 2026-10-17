import { PartitionClaimRefusedError } from "../../state/stateStoreErrors.js";
import { OwnedPartitionProducerFencedError } from "../runtimeErrors.js";
import type { PartitionRuntimeScope } from "../types/partitionRuntimeState.js";

export async function claimOwnedPartition({
	ctx,
}: Pick<PartitionRuntimeScope, "ctx">): Promise<void> {
	const { topic, partition } = ctx.config;
	const ownerEpoch = ctx.ownerEpoch?.();
	if (ownerEpoch === undefined) return;
	try {
		await ctx.stateStore.claimPartition?.({ topic, partition, ownerEpoch });
	} catch (cause) {
		if (!(cause instanceof PartitionClaimRefusedError)) throw cause;
		throw new OwnedPartitionProducerFencedError({ topic, partition, cause });
	}
}
