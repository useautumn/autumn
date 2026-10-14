import type { ConsumerConfig } from "kafkajs";
import type { KafkaConsumerClient } from "../../../../consumer/types/consumer.js";
import type { CatalogInvalidationRecord } from "../../types/catalogInvalidationRecord.js";

export type CatalogInvalidationKafka = {
	consumer(config: ConsumerConfig): KafkaConsumerClient;
};

export type CatalogInvalidationGroup =
	| { kind: "perProcess"; idPrefix: string }
	| { kind: "shared"; id: string };

export type CatalogInvalidationConsumerConfig = {
	topic: string;
	group: CatalogInvalidationGroup;
};

export type CatalogInvalidationHandler = {
	apply(params: { record: CatalogInvalidationRecord }): void | Promise<void>;
	skip(params: { cause: unknown; offset: string }): void;
};

export type CatalogInvalidationConsumer = {
	start(): Promise<void>;
	stop(): Promise<void>;
};
