import {
	createMeteringConsumer as createKafkaMeteringConsumer,
	createProgressTracker,
	type TopicConsumerConfig,
} from "@autumn/kafka";
import { createMeteringRecordHandler } from "./createMeteringRecordHandler.js";
import { createPartitionReplay } from "./replay/createPartitionReplay.js";
import type {
	MeteringConsumer,
	MeteringConsumerContext,
} from "./types/meteringConsumer.js";

export function createMeteringConsumer({
	ctx,
	config,
}: {
	ctx: MeteringConsumerContext;
	config: TopicConsumerConfig;
}): MeteringConsumer {
	const handler = createMeteringRecordHandler({ ctx });
	const positionTracker = ctx.positionTracker ?? createProgressTracker();
	const consumption = createKafkaMeteringConsumer({
		ctx: { consumer: ctx.consumer, handler, progress: positionTracker },
		config,
	});
	function createReplay() {
		return createPartitionReplay({
			ctx: {
				consumption,
				partitionOffsets: ctx.partitionOffsets,
				stateStore: ctx.stateStore,
				positionTracker,
			},
		});
	}
	return { start: consumption.start, stop: consumption.stop, createReplay };
}
