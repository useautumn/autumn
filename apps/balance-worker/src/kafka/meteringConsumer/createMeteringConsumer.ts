import {
	createMeteringConsumer as createKafkaMeteringConsumer,
	type TopicConsumerConfig,
} from "@autumn/kafka";
import { createMeteringRecordHandler } from "./createMeteringRecordHandler.js";
import { createPartitionReplay } from "./replay/createPartitionReplay.js";
import type {
	MeteringConsumer,
	MeteringConsumerContext,
} from "./types/meteringConsumer.js";
import type { PartitionReplay } from "./types/partitionReplay.js";

export function createMeteringConsumer({
	ctx,
	config,
}: {
	ctx: MeteringConsumerContext;
	config: TopicConsumerConfig;
}): MeteringConsumer {
	const handler = createMeteringRecordHandler({ ctx });
	const consumer = createKafkaMeteringConsumer({
		ctx: { consumer: ctx.consumer, handler, progress: ctx.positionTracker },
		config,
	});
	const { start, stop, withdrawPartition, resumePartition } = consumer;

	function createReplay({ partition }: { partition: number }): PartitionReplay {
		return createPartitionReplay({
			ctx: {
				stateStore: ctx.stateStore,
				partitionOffsets: ctx.partitionOffsets,
				positionTracker: consumer.progress,
				consumption: consumer,
			},
			position: { topic: config.topic, partition },
		});
	}

	return { start, stop, createReplay, withdrawPartition, resumePartition };
}
