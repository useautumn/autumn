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
	const readOnlyPartitions = new Set<number>();
	const ownerEpochByPartition = new Map<number, () => string | undefined>();
	const handler = createMeteringRecordHandler({
		ctx: {
			...ctx,
			recentCommandsByPartition,
			producedOffsetsByPartition,
			replayFloorByPartition,
			replayByPartition,
			readOnlyPartitions,
			ownerEpochByPartition,
		},
	});
	const consumer = createKafkaMeteringConsumer({
		ctx: {
			consumer: ctx.consumer,
			handler,
			progress: ctx.positionTracker,
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
		readOnly = false,
		ownerEpoch,
	}: Parameters<MeteringConsumer["createReplay"]>[0]): PartitionReplay {
		recentCommandsByPartition.set(partition, recentCommands);
		if (ownerEpoch && !readOnly)
			ownerEpochByPartition.set(partition, ownerEpoch);
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
		// A partition has one read-only and one writing replay; the handler parks whichever is reading.
		function startAndCatchUp(
			params: Parameters<PartitionReplay["startAndCatchUp"]>[0],
		): Promise<void> {
			replayByPartition.set(partition, replay);
			if (readOnly) readOnlyPartitions.add(partition);
			return replay.startAndCatchUp(params);
		}
		async function stop(): Promise<void> {
			try {
				await replay.stop();
			} finally {
				if (readOnly) readOnlyPartitions.delete(partition);
				else if (
					ownerEpoch &&
					ownerEpochByPartition.get(partition) === ownerEpoch
				)
					ownerEpochByPartition.delete(partition);
			}
		}
		return { ...replay, startAndCatchUp, stop };
	}

	return { start, stop, createReplay, withdrawPartition, resumePartition };
}
