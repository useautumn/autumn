import type { ConsumerConfig } from "kafkajs";
import type { KafkaConsumerClient } from "../../../../consumer/types/consumer.js";
import type { CatalogInvalidationRecord } from "../../types/catalogInvalidationRecord.js";

export type CatalogInvalidationKafka = {
	consumer(config: ConsumerConfig): KafkaConsumerClient;
};

/**
 * `perProcess`: a group of its own under this prefix, so every process reads every record from now on.
 * `shared`: one named group, so one process reads each record and a restart resumes where the group stopped.
 */
export type CatalogInvalidationGroup =
	| { kind: "perProcess"; idPrefix: string }
	| { kind: "shared"; id: string };

export type CatalogInvalidationConsumerConfig = {
	topic: string;
	group: CatalogInvalidationGroup;
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
