import {
	BALANCE_WORKER_DEDUP_WINDOW_MS,
	BALANCE_WORKER_REPLAY_FLOOR_LOOKUP_TIMEOUT_MS,
} from "@autumn/env/balanceWorkerConstants";
import {
	createProgressTracker,
	isConsumerGroupGoneError,
	KafkaPartitionOffsetsNotFoundError,
	readPartitionLogRange,
	readTopicHighWatermarks,
	subscribePartitionChanges,
} from "@autumn/kafka";
import type { OwnedPartitionHealth } from "../../health/ownedPartitionHealth.js";
import { createCommandRecordHandler } from "../../kafka/commandConsumer/createCommandRecordHandler.js";
import { createMeteringConsumer } from "../../kafka/meteringConsumer/createMeteringConsumer.js";
import { createOwnerEpochCell } from "../../kafka/ownerEpochCell.js";
import { createPartitions } from "../../partitions/createPartitions.js";
import type {
	PartitionChangeListeners,
	PartitionFailure,
	PartitionProgress,
	PartitionRuntimeResources,
	Partitions,
} from "../../partitions/types/partitions.js";
import { createProducedOffsets } from "../../processor/writer/producedOffsets/createProducedOffsets.js";
import { createHashedRecentCommands } from "../../processor/writer/recentCommands/createHashedRecentCommands.js";
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
	if (config.commandTopic && !ctx.commandTopicOffsets)
		throw new Error("A command topic needs its own commandTopicOffsets admin");
	const { commandTopicOffsets } = ctx;
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
	// The current runtime's park hook per partition, set when the runtime is built below.
	const unavailableByPartition = new Map<
		number,
		(failure: PartitionFailure) => void
	>();
	function markPartitionUnavailable({
		partition,
		cause,
	}: {
		partition: number;
		cause: unknown;
	}): void {
		unavailableByPartition.get(partition)?.({ cause });
	}
	const commandHandler = createCommandRecordHandler({
		ctx: {
			findOwnedRuntime,
			readCommandNextOffset,
			idempotencyKeys: ctx.idempotencyKeys,
			logger: ctx.logger,
			markUnavailable: markPartitionUnavailable,
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
		// Serial-decide arm D keeps the window in typed-array tables, so the GC never walks it.
		const recentCommands =
			ctx.readDedupStore?.() === "hashed"
				? createHashedRecentCommands({
						windowMs: BALANCE_WORKER_DEDUP_WINDOW_MS,
						now: Date.now,
					})
				: createRecentCommands({
						windowMs: BALANCE_WORKER_DEDUP_WINDOW_MS,
						now: Date.now,
					});
		// Also one per runtime: the writer remembers what it produced, the replay passes those records unread.
		const producedOffsets = createProducedOffsets();
		// The claim's epoch, written by the runtime, read by its follower to spot a fence from a later owner.
		const ownerEpoch = createOwnerEpochCell();
		const follower = meteringConsumer.createReplay({
			partition,
			recentCommands,
			producedOffsets,
			ownerEpoch: ownerEpoch.read,
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
			ownerEpoch,
		});
		function markUnavailable(failure: PartitionFailure): void {
			preparation.markUnavailable(failure);
			follower.markUnavailable(failure);
		}
		unavailableByPartition.set(partition, markUnavailable);
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
		function pauseTopic(): void {
			ctx.consumer.pause([{ topic, partitions }]);
		}
		steer(pauseTopic);
	}

	/** A group that is gone, because kafkajs crashed its runner and is rejoining, leaves nothing to steer. */
	function steer(run: () => void): void {
		try {
			run();
		} catch (cause) {
			if (!isConsumerGroupGoneError({ cause })) throw cause;
		}
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
				if (!commandTopicOffsets)
					throw new Error(
						"A command topic needs its own commandTopicOffsets admin",
					);
				const range = await readPartitionLogRange({
					ctx: { partitionOffsets: commandTopicOffsets },
					topic,
					partition,
				});
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
				function seekAndResume(): void {
					ctx.consumer.seek({
						topic,
						partition,
						offset: nextOffset.toString(),
					});
					ctx.consumer.resume([{ topic, partitions: [partition] }]);
				}
				steer(seekAndResume);
			}
			return;
		}
		function resumeTopic(): void {
			ctx.consumer.resume([{ topic, partitions }]);
		}
		steer(resumeTopic);
	}

	async function connect(): Promise<void> {
		await Promise.all([
			ctx.partitionOffsets.connect(),
			commandTopicOffsets?.connect(),
		]);
	}

	async function disconnect(): Promise<void> {
		await Promise.all([
			ctx.partitionOffsets.disconnect(),
			commandTopicOffsets?.disconnect(),
		]);
	}

	async function fetchHighWatermarks({
		topic,
	}: {
		topic: string;
	}): Promise<WorkerPartitionHighWatermarks> {
		// The commands topic has its own admin: kafkajs admins sharing topics overwrite each other's metadata mid-read.
		const partitionOffsets =
			topic === config.commandTopic && commandTopicOffsets
				? commandTopicOffsets
				: ctx.partitionOffsets;
		const highWatermarks = await readTopicHighWatermarks({
			ctx: { partitionOffsets },
			topic,
		});
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
				restart: meteringConsumer.restart,
				pause,
				resume,
			},
			logger: ctx.logger,
			partitionOffsets: { connect, disconnect, fetchHighWatermarks },
			progress: { readProgress, observeHighWatermark },
			subscribePartitionChanges: subscribeChanges,
			createRuntime,
			served: ctx.served,
			ownershipLink: ctx.ownershipLink,
			awaitReadyAnnouncement: ctx.awaitReadyAnnouncement,
			acquirePreparation: ctx.acquirePreparation,
			onError: ctx.onError,
			onUnhealthyPartition: ctx.onUnhealthyPartition,
			onServiceStopped: ctx.onServiceStopped,
		},
		config,
	});

	/** Each served partition's command lag beside its log progress: the bookmark says what is decided, the topic what is queued. */
	function withCommandLag(health: OwnedPartitionHealth): OwnedPartitionHealth {
		const { commandTopic } = config;
		if (!commandTopic) return health;
		const consumedNextOffset = readCommandNextOffset({
			partition: health.partition,
		});
		const { highWatermark } = positionTracker.readProgress({
			topic: commandTopic,
			partition: health.partition,
		});
		const lag =
			consumedNextOffset === null || highWatermark === null
				? null
				: highWatermark > consumedNextOffset
					? highWatermark - consumedNextOffset
					: 0n;
		return { ...health, commands: { consumedNextOffset, highWatermark, lag } };
	}

	function partitionsWithCommandLag(): OwnedPartitionHealth[] {
		return partitions.partitions().map(withCommandLag);
	}

	return { ...partitions, partitions: partitionsWithCommandLag };
}
