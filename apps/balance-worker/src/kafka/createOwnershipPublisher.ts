import {
	createOwnershipPublisher as createKafkaOwnershipPublisher,
	type KafkaProducerSession,
} from "@autumn/kafka";
import type { Admin } from "kafkajs";
import type { PartitionOwnershipPublication } from "../partitions/types/partitions.js";

export function createOwnershipPublisher({
	ctx,
	config,
}: {
	ctx: {
		session: KafkaProducerSession;
		partitionOffsets: Pick<Admin, "fetchTopicOffsets">;
	};
	config: { topic: string; partition: number; endpoint: string };
}): PartitionOwnershipPublication {
	const publisher = createKafkaOwnershipPublisher({
		ctx: { producer: ctx.session },
		config: { topic: config.topic },
	});

	async function claim(): Promise<{ routeEpoch: string }> {
		const offsets = await ctx.partitionOffsets.fetchTopicOffsets(config.topic);
		let partitionExists = false;
		for (const { partition } of offsets) {
			if (partition === config.partition) {
				partitionExists = true;
				break;
			}
		}
		if (!partitionExists) {
			throw new Error(
				`Ownership topic ${config.topic} must contain metering partition ${config.partition}`,
			);
		}
		if (!ctx.session.isUsable()) {
			throw new Error(
				"Ownership claim requires an initialized producer session",
			);
		}
		return publisher.claim({
			partition: config.partition,
			endpoint: config.endpoint,
			claimedAt: Date.now(),
		});
	}

	async function release(): Promise<void> {
		if (!ctx.session.isUsable()) return;
		await publisher.release({
			partition: config.partition,
			releasedAt: Date.now(),
		});
	}

	return { claim, release };
}
