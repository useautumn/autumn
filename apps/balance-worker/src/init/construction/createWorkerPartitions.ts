import {
	BALANCE_WORKER_DEDUP_WINDOW_MS,
	BALANCE_WORKER_REPLAY_FLOOR_LOOKUP_TIMEOUT_MS,
} from "@autumn/env/balanceWorkerConstants";
import {
	createProgressTracker,
	KafkaPartitionOffsetsNotFoundError,
	readPartitionLogRange,
	readTopicHighWatermarks,
	subscribePartitionChanges,
} from "@autumn/kafka";
import { createCommandRecordHandler } from "../../kafka/commandConsumer/createCommandRecordHandler.js";
import { createMeteringConsumer } from "../../kafka/meteringConsumer/createMeteringConsumer.js";
import { createPartitions } from "../../partitions/createPartitions.js";
import type {
	PartitionChangeListeners,
	PartitionFailure,
	PartitionProgress,
	PartitionRuntimeResources,
	Partitions,
} from "../../partitions/types/partitions.js";
import { createProducedOffsets } from "../../processor/writer/producedOffsets/createProducedOffsets.js";
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
	// Resolved per record: the partitions are built further down, once the consumer exists.
	function findOwnedRuntime({ partition }: { partition: number }) {
		return partitions.findOwnedRuntime({ partition });
	}
	// Both bookmarks sit on the metering topic's progress row.
	function readCommandNextOffset({ partition }: { partition: number }) {
		return ctx.stateStore.readCommandNextOffset({
			topic: config.topic,
			partition,
		});
	}
	const commandHandler = createCommandRecordHandler({
		ctx: {
			findOwnedRuntime,
			readCommandNextOffset,
			idempotencyKeys: ctx.idempotencyKeys,
			logger: ctx.logger,
		},
	});
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
			...(config.commandTopic && {
				commands: { topic: config.commandTopic, handler: commandHandler },
			}),
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
		// Also one per runtime: the writer remembers what it produced, the replay passes those records unread.
		const producedOffsets = createProducedOffsets();
		const follower = meteringConsumer.createReplay({
			partition,
			recentCommands,
			producedOffsets,
		});
		const preparation = meteringConsumer.createReplay({
			partition,
			recentCommands,
			readOnly: true,
		});
		const resources = ctx.createRuntime({
			topic,
			partition,
			follower,
			preparation,
			recentCommands,
			producedOffsets,
		});
		function markUnavailable(failure: PartitionFailure): void {
			preparation.markUnavailable(failure);
			follower.markUnavailable(failure);
		}
		return { ...resources, markUnavailable };
	}

	function subscribeChanges(listeners: PartitionChangeListeners): () => void {
		return subscribePartitionChanges({
			ctx: { consumer: ctx.consumer, listeners },
			topic: config.topic,
		});
	}

	const commandResumeGeneration = new Map<number, number>();
	function pause({
		topic,
		partitions,
	}: {
		topic: string;
		partitions: number[];
	}): void {
		if (topic === config.commandTopic) {
			for (const partition of partitions)
				commandResumeGeneration.set(
					partition,
					(commandResumeGeneration.get(partition) ?? 0) + 1,
				);
		}
		ctx.consumer.pause([{ topic, partitions }]);
	}

	async function resume({
		topic,
		partitions,
	}: {
		topic: string;
		partitions: number[];
	}): Promise<void> {
		if (topic === config.commandTopic) {
			for (const partition of partitions) {
				const generation = commandResumeGeneration.get(partition);
				const range = await readPartitionLogRange({ ctx, topic, partition });
				if (generation !== commandResumeGeneration.get(partition)) continue;
				const nextOffset =
					readCommandNextOffset({ partition }) ?? range.logStartOffset;
				if (
					nextOffset < range.logStartOffset ||
					nextOffset > range.logEndOffset
				)
					throw new Error(
						`Command bookmark outside retained log: ${topic}[${partition}] at ${nextOffset}`,
					);
				ctx.consumer.seek({ topic, partition, offset: nextOffset.toString() });
				ctx.consumer.resume([{ topic, partitions: [partition] }]);
			}
			return;
		}
		ctx.consumer.resume([{ topic, partitions }]);
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

	const partitions: Partitions = createPartitions({
		ctx: {
			consumer: {
				start: meteringConsumer.start,
				stop: meteringConsumer.stop,
				pause,
				resume,
			},
			partitionOffsets: { connect, disconnect, fetchHighWatermarks },
			progress: { readProgress, observeHighWatermark },
			subscribePartitionChanges: subscribeChanges,
			createRuntime,
			ownershipLink: ctx.ownershipLink,
			awaitReadyAnnouncement: ctx.awaitReadyAnnouncement,
			onError: ctx.onError,
			onUnhealthyPartition: ctx.onUnhealthyPartition,
			onServiceStopped: ctx.onServiceStopped,
		},
		config,
	});
	return partitions;
}
