import type { KafkaConsumerClient } from "@autumn/kafka";
import type { Admin } from "kafkajs";
import type { PartitionReplay } from "../../kafka/meteringConsumer/types/partitionReplay.js";
import type {
	PartitionRuntimeResources,
	PartitionsDependencies,
} from "../../partitions/types/partitions.js";
import type { CheckpointStateStore } from "../../state/types/stateStore.js";

export type KafkaOwnedPartitionGroupConsumerPort = KafkaConsumerClient;
export type KafkaOwnedPartitionGroupAdminPort = Pick<
	Admin,
	"fetchTopicOffsets" | "connect" | "disconnect"
>;

export type KafkaPartitionRuntimeFactory = (position: {
	topic: string;
	partition: number;
	follower: PartitionReplay;
}) => Omit<PartitionRuntimeResources, "markUnavailable">;

export type WorkerPartitionsContext = {
	consumer: KafkaOwnedPartitionGroupConsumerPort;
	partitionOffsets: KafkaOwnedPartitionGroupAdminPort;
	stateStore: CheckpointStateStore;
	createRuntime: KafkaPartitionRuntimeFactory;
	onError: PartitionsDependencies["onError"];
	onUnhealthyPartition: PartitionsDependencies["onUnhealthyPartition"];
};

export type WorkerPartitionsConfig = {
	topic: string;
	partitionsConsumedConcurrently: number;
	healthRefreshIntervalMs: number;
	partitionBootstrapRetryIntervalMs?: number;
};

export type WorkerPartitionHighWatermarks = {
	readHighWatermark(position: { partition: number }): bigint;
};
