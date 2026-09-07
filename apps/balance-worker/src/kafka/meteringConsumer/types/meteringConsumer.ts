import type { KafkaConsumerClient } from "@autumn/kafka";
import type { Admin } from "kafkajs";
import type { SqliteBalanceStateStore } from "../../../state/sqliteBalanceStateStore.js";

export type MeteringConsumerContext = {
	consumer: KafkaConsumerClient;
	partitionOffsets: Pick<Admin, "fetchTopicOffsets">;
	stateStore: SqliteBalanceStateStore;
};

export type MeteringConsumer = {
	start(): Promise<void>;
	stop(): Promise<void>;
};
