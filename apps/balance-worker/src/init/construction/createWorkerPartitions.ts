import {
	BALANCE_WORKER_DEDUP_WINDOW_MS,
	BALANCE_WORKER_REPLAY_FLOOR_LOOKUP_TIMEOUT_MS,
} from "@autumn/env/balanceWorkerConstants";
import {
	createProgressTracker,
	KafkaPartitionOffsetsNotFoundError,
	readTopicHighWatermarks,
	subscribePartitionChanges,
} from "@autumn/kafka";
import { createMeteringConsumer } from "../../kafka/meteringConsumer/createMeteringConsumer.js";
import { createPartitions } from "../../partitions/createPartitions.js";
import type {
	PartitionChangeListeners,
	PartitionProgress,
	PartitionRuntimeResources,
	Partitions,
} from "../../partitions/types/partitions.js";
import { createRecentCommands } from "../../processor/writer/recentCommands/createRecentCommands.js";
import type {
	WorkerPartitionHighWatermarks,
	WorkerPartitionsConfig,
	WorkerPartitionsContext,
} from "../types/workerPartitions.js";

export function createWorkerPartitions({
	ctx,
	config,
}: {
	ctx: WorkerPartitionsContext;
	config: WorkerPartitionsConfig;
}): Partitions {
	if (config.topic.trim().length === 0)
		throw new Error("Kafka topic cannot be empty");
	if (
		!Number.isSafeInteger(config.partitionsConsumedConcurrently) ||
		config.partitionsConsumedConcurrently < 1
	) {
		throw new RangeError(
			"partitionsConsumedConcurrently must be a positive safe integer",
		);
	}
	const positionTracker = createProgressTracker();
	const meteringConsumer = createMeteringConsumer({
		ctx: {
			consumer: ctx.consumer,
			partitionOffsets: ctx.partitionOffsets,
			stateStore: ctx.stateStore,
			positionTracker,
			replayWindow: {
				windowMs: BALANCE_WORKER_DEDUP_WINDOW_MS,
				lookupTimeoutMs: BALANCE_WORKER_REPLAY_FLOOR_LOOKUP_TIMEOUT_MS,
				now: Date.now,
			},
			logger: ctx.logger,
		},
		config: {
			topic: config.topic,
			partitionsConsumedConcurrently: config.partitionsConsumedConcurrently,
		},
	});

	function createRuntime({
		topic,
		partition,
	}: {
		topic: string;
		partition: number;
	}): PartitionRuntimeResources {
		// One per partition: the writer and the log replay both remember into it, decide reads it.
		const recentCommands = createRecentCommands({
			windowMs: BALANCE_WORKER_DEDUP_WINDOW_MS,
			now: Date.now,
		});
		const follower = meteringConsumer.createReplay({
			partition,
			recentCommands,
		});
		const resources = ctx.createRuntime({
			topic,
			partition,
			follower,
			recentCommands,
		});
		return { ...resources, markUnavailable: follower.markUnavailable };
	}

	function subscribeChanges(listeners: PartitionChangeListeners): () => void {
		return subscribePartitionChanges({
			ctx: { consumer: ctx.consumer, listeners },
			topic: config.topic,
		});
	}

	function pause({
		topic,
		partitions,
	}: {
		topic: string;
		partitions: number[];
	}): void {
		ctx.consumer.pause([{ topic, partitions }]);
	}

	function connect(): Promise<void> {
		return ctx.partitionOffsets.connect();
	}

	function disconnect(): Promise<void> {
		return ctx.partitionOffsets.disconnect();
	}

	async function fetchHighWatermarks({
		topic,
	}: {
		topic: string;
	}): Promise<WorkerPartitionHighWatermarks> {
		const highWatermarks = await readTopicHighWatermarks({ ctx, topic });
		function readHighWatermark({ partition }: { partition: number }): bigint {
			const highWatermark = highWatermarks.get(partition);
			if (highWatermark !== undefined) return highWatermark;
			throw new KafkaPartitionOffsetsNotFoundError({ topic, partition });
		}
		return { readHighWatermark };
	}

	function readProgress(position: {
		topic: string;
		partition: number;
	}): PartitionProgress {
		return {
			localNextOffset: ctx.stateStore.readNextOffset(position),
			...positionTracker.readProgress(position),
		};
	}

	function observeHighWatermark(position: {
		topic: string;
		partition: number;
		highWatermark: bigint;
	}): void {
		positionTracker.observeHighWatermark(position);
	}

	return createPartitions({
		ctx: {
			consumer: {
				start: meteringConsumer.start,
				stop: meteringConsumer.stop,
				pause,
			},
			partitionOffsets: { connect, disconnect, fetchHighWatermarks },
			progress: { readProgress, observeHighWatermark },
			subscribePartitionChanges: subscribeChanges,
			createRuntime,
			onError: ctx.onError,
			onUnhealthyPartition: ctx.onUnhealthyPartition,
			onServiceStopped: ctx.onServiceStopped,
		},
		config,
	});
}
