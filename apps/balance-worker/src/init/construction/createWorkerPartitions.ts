import { subscribePartitionChanges } from "@autumn/kafka";
import { createMeteringConsumer } from "../../kafka/meteringConsumer/createMeteringConsumer.js";
import { createPartitions } from "../../partitions/createPartitions.js";
import type {
	PartitionChangeListeners,
	PartitionResources,
	Partitions,
} from "../../partitions/types/partitions.js";
import type {
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
	if (!config.topic.trim()) throw new Error("Kafka topic cannot be empty");
	if (
		!Number.isSafeInteger(config.partitionsConsumedConcurrently) ||
		config.partitionsConsumedConcurrently < 1
	) {
		throw new RangeError(
			"partitionsConsumedConcurrently must be a positive safe integer",
		);
	}
	const meteringConsumer = createMeteringConsumer({ ctx, config });
	function createRuntime({
		topic,
		partition,
	}: {
		topic: string;
		partition: number;
	}): PartitionResources {
		const follower = meteringConsumer.createReplay();
		const runtime = ctx.createRuntime({ topic, partition, follower });
		return { runtime, markUnavailable: follower.markUnavailable };
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
	return createPartitions({
		ctx: {
			consumer: {
				start: meteringConsumer.start,
				stop: meteringConsumer.stop,
				pause,
			},
			partitionOffsets: { connect, disconnect },
			subscribePartitionChanges: subscribeChanges,
			createRuntime,
			onError: ctx.onError,
		},
		config,
	});
}
