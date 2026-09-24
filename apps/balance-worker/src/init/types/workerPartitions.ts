import type { IdempotencyKeyStore } from "@autumn/dynamodb";
import type { KafkaConsumerClient } from "@autumn/kafka";
import type { AutumnLogger } from "@autumn/logging";
import type { Admin } from "kafkajs";
import type { PartitionReplay } from "../../kafka/meteringConsumer/types/partitionReplay.js";
import type {
	PartitionRuntimeResources,
	PartitionsDependencies,
} from "../../partitions/types/partitions.js";
import type { ProducedOffsets } from "../../processor/writer/producedOffsets/createProducedOffsets.js";
import type { RecentCommands } from "../../processor/writer/recentCommands/types/recentCommands.js";
import type { StateStore } from "../../state/types/stateStore.js";

export type KafkaOwnedPartitionGroupConsumerPort = KafkaConsumerClient;
export type KafkaOwnedPartitionGroupAdminPort = Pick<
	Admin,
	"fetchTopicOffsets" | "connect" | "disconnect"
>;

export type KafkaPartitionRuntimeFactory = (position: {
	topic: string;
	partition: number;
	follower: PartitionReplay;
	recentCommands: RecentCommands;
	producedOffsets?: ProducedOffsets;
}) => Omit<PartitionRuntimeResources, "markUnavailable">;

export type WorkerPartitionsContext = {
	idempotencyKeys: IdempotencyKeyStore;
	consumer: KafkaOwnedPartitionGroupConsumerPort;
	partitionOffsets: KafkaOwnedPartitionGroupAdminPort &
		Partial<Pick<Admin, "fetchTopicOffsetsByTimestamp">>;
	logger?: Pick<AutumnLogger, "info" | "warn">;
	stateStore: StateStore;
	createRuntime: KafkaPartitionRuntimeFactory;
	onError: PartitionsDependencies["onError"];
	onUnhealthyPartition: PartitionsDependencies["onUnhealthyPartition"];
	onServiceStopped?: PartitionsDependencies["onServiceStopped"];
};

export type WorkerPartitionsConfig = {
	topic: string;
	/** Consumed on the same membership when set; a bare partition group in a test has none. */
	commandTopic?: string;
	partitionsConsumedConcurrently: number;
	healthRefreshIntervalMs: number;
	partitionBootstrapRetryIntervalMs?: number;
};

export type WorkerPartitionHighWatermarks = {
	readHighWatermark(position: { partition: number }): bigint;
};
