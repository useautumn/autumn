import type { KafkaConsumerClient, ProgressTracker } from "@autumn/kafka";
import type { Admin } from "kafkajs";
import type { StateStore } from "../../../state/types/stateStore.js";
import type { PartitionReplay } from "./partitionReplay.js";

export type MeteringConsumer = {
	start(): Promise<void>;
	stop(): Promise<void>;
	createReplay(position: { partition: number }): PartitionReplay;
	withdrawPartition(position: { partition: number }): Promise<void>;
	resumePartition(position: { partition: number }): void;
};

export type MeteringConsumerContext = {
	consumer: KafkaConsumerClient;
	partitionOffsets: Pick<Admin, "fetchTopicOffsets">;
	stateStore: StateStore;
	positionTracker: ProgressTracker;
};
