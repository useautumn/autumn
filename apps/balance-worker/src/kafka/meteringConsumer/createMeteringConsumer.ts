import {
	createMeteringConsumer as createKafkaMeteringConsumer,
	type TopicConsumerConfig,
} from "@autumn/kafka";
import type { RecentCommands } from "../../processor/writer/recentCommands/types/recentCommands.js";
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
	const recentCommandsByPartition = new Map<number, RecentCommands>();
	const replayFloorByPartition = new Map<number, bigint>();
	const handler = createMeteringRecordHandler({
		ctx: {
			...ctx,
			recentCommandsByPartition,
			replayFloorByPartition,
		},
	});
	const consumer = createKafkaMeteringConsumer({
		ctx: { consumer: ctx.consumer, handler, progress: ctx.positionTracker },
		config,
	});
	const { start, stop, withdrawPartition, resumePartition } = consumer;

	function createReplay({
		partition,
		recentCommands,
	}: Parameters<MeteringConsumer["createReplay"]>[0]): PartitionReplay {
		recentCommandsByPartition.set(partition, recentCommands);
		return createPartitionReplay({
			ctx: {
				stateStore: ctx.stateStore,
				partitionOffsets: ctx.partitionOffsets,
				positionTracker: consumer.progress,
				replayWindow: ctx.replayWindow,
				replayFloorByPartition,
				logger: ctx.logger,
				consumption: consumer,
			},
			position: { topic: config.topic, partition },
		});
	}

	return { start, stop, createReplay, withdrawPartition, resumePartition };
}
