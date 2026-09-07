import type { KafkaConsumerClient, ProgressTracker } from "@autumn/kafka";
import type { Admin } from "kafkajs";
import type { SqliteBalanceStateStore } from "../../../state/sqliteBalanceStateStore.js";
import type { PartitionReplay } from "./partitionReplay.js";

export type MeteringConsumerContext = {
	positionTracker?: ProgressTracker;
	consumer: KafkaConsumerClient;
	partitionOffsets: Pick<Admin, "fetchTopicOffsets">;
	stateStore: SqliteBalanceStateStore;
};

export type MeteringConsumer = {
	createReplay(): PartitionReplay;
	start(): Promise<void>;
	stop(): Promise<void>;
};
