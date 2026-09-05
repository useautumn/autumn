import { startConsumer, stopConsumer } from "./consumerLifecycle.js";
import type {
	TopicConsumer,
	TopicConsumerConfig,
	TopicConsumerContext,
	TopicConsumerDependencies,
	TopicConsumerState,
} from "./types/consumer.js";

export function createTopicConsumer({
	ctx: dependencies,
	config,
}: {
	ctx: TopicConsumerDependencies;
	config: TopicConsumerConfig;
}): TopicConsumer {
	validateConsumerConfig(config);
	const ctx: TopicConsumerContext = { ...dependencies, config };
	const state: TopicConsumerState = {
		isStarted: false,
		isStopped: false,
		removeGroupJoinListener: null,
		removeEndBatchProcessListener: null,
		initializedPartitions: new Set(),
		withdrawnPartitions: new Set(),
		partitionGenerations: new Map(),
		activeBatches: new Map(),
	};

	function start(): Promise<void> {
		return startConsumer({ ctx, state });
	}

	function stop(): Promise<void> {
		return stopConsumer({ ctx, state });
	}

	async function withdrawPartition({
		partition,
	}: {
		partition: number;
	}): Promise<void> {
		state.withdrawnPartitions.add(partition);
		state.partitionGenerations.set(
			partition,
			(state.partitionGenerations.get(partition) ?? 0) + 1,
		);
		await Promise.allSettled([...(state.activeBatches.get(partition) ?? [])]);
		state.initializedPartitions.delete(
			JSON.stringify([config.topic, partition]),
		);
	}

	function resumePartition({ partition }: { partition: number }): void {
		state.withdrawnPartitions.delete(partition);
	}

	function seekPartition({
		partition,
		nextOffset,
	}: {
		partition: number;
		nextOffset: bigint;
	}): void {
		ctx.consumer.seek({
			topic: config.topic,
			partition,
			offset: nextOffset.toString(),
		});
	}

	function pausePartition({ partition }: { partition: number }): void {
		ctx.consumer.pause([{ topic: config.topic, partitions: [partition] }]);
	}

	function resumeFetching({ partition }: { partition: number }): void {
		ctx.consumer.resume([{ topic: config.topic, partitions: [partition] }]);
	}

	return {
		start,
		stop,
		withdrawPartition,
		resumePartition,
		seekPartition,
		pausePartition,
		resumeFetching,
		progress: ctx.progress,
	};
}

function validateConsumerConfig(config: TopicConsumerConfig): void {
	if (config.topic.trim().length === 0)
		throw new Error("Kafka topic cannot be empty");
	const concurrency = config.partitionsConsumedConcurrently ?? 1;
	if (!Number.isSafeInteger(concurrency) || concurrency < 1) {
		throw new RangeError(`Invalid concurrent partition count: ${concurrency}`);
	}
}
