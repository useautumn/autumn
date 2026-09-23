import type { ConsumerConfig } from "kafkajs";
import type { KafkaConsumerClient } from "../../../../consumer/types/consumer.js";
import type { CatalogInvalidationRecord } from "../../types/catalogInvalidationRecord.js";

export type CatalogInvalidationKafka = {
	consumer(config: ConsumerConfig): KafkaConsumerClient;
};

export type CatalogInvalidationConsumerConfig = {
	topic: string;
	/** Prefix of a group id unique to this process: every subscriber reads every record. */
	groupIdPrefix: string;
};

export type CatalogInvalidationHandler = {
	/** Called in log order; a throw is reported through `skip` and the record is passed over. */
	apply(params: { record: CatalogInvalidationRecord }): void | Promise<void>;
	/** A record that could not be read or applied; the log moves on regardless. */
	skip(params: { cause: unknown; offset: string }): void;
};

export type CatalogInvalidationConsumer = {
	start(): Promise<void>;
	stop(): Promise<void>;
};
