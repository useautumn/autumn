import type { KafkaConsumerClient } from "@autumn/kafka";
import type { Admin } from "kafkajs";
import type { PartitionRuntime } from "../../partitions/types/partitions.js";
import type { SqliteBalanceStateStore } from "../../state/sqliteBalanceStateStore.js";
import type { PartitionRuntimeFactoryInput } from "./partitionRuntimeFactory.js";

export type WorkerPartitionsContext = {
	consumer: KafkaConsumerClient;
	partitionOffsets: Pick<Admin, "connect" | "disconnect" | "fetchTopicOffsets">;
	stateStore: SqliteBalanceStateStore;
	createRuntime(input: PartitionRuntimeFactoryInput): PartitionRuntime;
	onError(failure: { cause: unknown }): void;
};
export type WorkerPartitionsConfig = {
	topic: string;
	partitionsConsumedConcurrently: number;
};
