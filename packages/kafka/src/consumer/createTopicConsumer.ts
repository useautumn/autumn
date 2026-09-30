import { isConsumerGroupGoneError } from "./consumerErrors.js";
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

	// A stopped consumer has no group to steer; kafkajs throws, and a partition retiring after the group was left has nothing left to pause.
	function seekPartition({
		partition,
		nextOffset,
	}: {
		partition: number;
		nextOffset: bigint;
	}): void {
		if (state.isStopped) return;
		function seek(): void {
			ctx.consumer.seek({
				topic: config.topic,
				partition,
				offset: nextOffset.toString(),
			});
		}
		steer(seek);
	}

	function pausePartition({ partition }: { partition: number }): void {
		if (state.isStopped) return;
		function pause(): void {
			ctx.consumer.pause([{ topic: config.topic, partitions: [partition] }]);
		}
		steer(pause);
	}

	function resumeFetching({ partition }: { partition: number }): void {
		if (state.isStopped) return;
		function resume(): void {
			ctx.consumer.resume([{ topic: config.topic, partitions: [partition] }]);
		}
		steer(resume);
	}

	/** The group can also be gone without a stop: kafkajs crashed the runner and is rejoining. The
	 *  partition is then being reassigned, so there is nothing to steer and no failure to report. */
	function steer(run: () => void): void {
		try {
			run();
		} catch (cause) {
			if (!isConsumerGroupGoneError({ cause })) throw cause;
		}
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
	const topics = new Set([config.topic]);
	for (const secondary of config.secondaryTopics ?? []) {
		if (secondary.trim().length === 0 || topics.has(secondary))
			throw new Error(
				`Secondary Kafka topic is empty or repeated: ${secondary}`,
			);
		topics.add(secondary);
	}
	const concurrency = config.partitionsConsumedConcurrently ?? 1;
	if (!Number.isSafeInteger(concurrency) || concurrency < 1) {
		throw new RangeError(`Invalid concurrent partition count: ${concurrency}`);
	}
	const recordsPerSlice = config.recordsPerSlice ?? 1;
	if (!Number.isSafeInteger(recordsPerSlice) || recordsPerSlice < 1) {
		throw new RangeError(`Invalid records per slice: ${recordsPerSlice}`);
	}
}
