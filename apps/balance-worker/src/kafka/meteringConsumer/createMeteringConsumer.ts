import {
	createMeteringConsumer as createKafkaMeteringConsumer,
	type TopicConsumerConfig,
} from "@autumn/kafka";
import type { ProducedOffsets } from "../../processor/writer/producedOffsets/createProducedOffsets.js";
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
	const producedOffsetsByPartition = new Map<number, ProducedOffsets>();
	const replayFloorByPartition = new Map<number, bigint>();
	const replayByPartition = new Map<number, PartitionReplay>();
	const handler = createMeteringRecordHandler({
		ctx: {
			...ctx,
			recentCommandsByPartition,
			producedOffsetsByPartition,
			replayFloorByPartition,
			replayByPartition,
		},
	});
	const consumer = createKafkaMeteringConsumer({
		ctx: {
			consumer: ctx.consumer,
			handler,
			progress: ctx.positionTracker,
			// The worker applies row changes and never reads the snapshot; decoding it cost as much as writing it.
			snapshot: "skip",
			...(ctx.commands && {
				secondaryHandlers: { [ctx.commands.topic]: ctx.commands.handler },
			}),
		},
		config,
	});
	const { start, stop, withdrawPartition, resumePartition } = consumer;

	function createReplay({
		partition,
		recentCommands,
		producedOffsets,
	}: Parameters<MeteringConsumer["createReplay"]>[0]): PartitionReplay {
		recentCommandsByPartition.set(partition, recentCommands);
		if (producedOffsets)
			producedOffsetsByPartition.set(partition, producedOffsets);
		else producedOffsetsByPartition.delete(partition);
		const replay = createPartitionReplay({
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
		replayByPartition.set(partition, replay);
		return replay;
	}

	return { start, stop, createReplay, withdrawPartition, resumePartition };
}
