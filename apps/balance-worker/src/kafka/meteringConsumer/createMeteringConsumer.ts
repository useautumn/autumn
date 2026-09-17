import {
	createMeteringConsumer as createKafkaMeteringConsumer,
	createProgressTracker,
	type TopicConsumerConfig,
} from "@autumn/kafka";
import { createMeteringRecordHandler } from "./createMeteringRecordHandler.js";
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
	const { start, stop } = createKafkaMeteringConsumer({
		ctx: { consumer: ctx.consumer, handler, progress: createProgressTracker() },
		config,
	});
	return { start, stop };
}
