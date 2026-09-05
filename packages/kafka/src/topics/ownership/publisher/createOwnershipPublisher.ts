import { claimPartition } from "./claimPartition.js";
import { releasePartition } from "./releasePartition.js";
import type {
	OwnershipClaim,
	OwnershipPublication,
	OwnershipPublisher,
	OwnershipPublisherContext,
	OwnershipRelease,
} from "./types/ownershipPublisher.js";

export function createOwnershipPublisher({
	ctx,
	config,
}: {
	ctx: OwnershipPublisherContext;
	config: { topic: string };
}): OwnershipPublisher {
	function claim(params: OwnershipClaim): Promise<OwnershipPublication> {
		return claimPartition({ ctx, topic: config.topic, ...params });
	}

	function release(params: OwnershipRelease): Promise<OwnershipPublication> {
		return releasePartition({ ctx, topic: config.topic, ...params });
	}

	return { claim, release };
}
