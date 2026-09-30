import { announceDraining } from "./announceDraining.js";
import { announcePreparing } from "./announcePreparing.js";
import { announceReady } from "./announceReady.js";
import { claimPartition } from "./claimPartition.js";
import { releasePartition } from "./releasePartition.js";
import type {
	OwnershipClaim,
	OwnershipDraining,
	OwnershipPreparation,
	OwnershipPublication,
	OwnershipPublisher,
	OwnershipPublisherContext,
	OwnershipReadiness,
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

	async function announce(params: OwnershipReadiness): Promise<void> {
		if (!ctx.sender)
			throw new Error("Ownership readiness requires a plain producer");
		await announceReady({
			ctx: { sender: ctx.sender },
			topic: config.topic,
			...params,
		});
	}

	async function announceDrain(params: OwnershipDraining): Promise<void> {
		if (!ctx.sender)
			throw new Error("Ownership draining requires a plain producer");
		await announceDraining({
			ctx: { sender: ctx.sender },
			topic: config.topic,
			...params,
		});
	}

	async function announcePreparation(
		params: OwnershipPreparation,
	): Promise<void> {
		if (!ctx.sender)
			throw new Error("Ownership preparing requires a plain producer");
		await announcePreparing({
			ctx: { sender: ctx.sender },
			topic: config.topic,
			...params,
		});
	}

	return {
		claim,
		release,
		announceReady: announce,
		announceDraining: announceDrain,
		announcePreparing: announcePreparation,
	};
}
