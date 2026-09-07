import type { KafkaConfig, ProducerConfig, Transaction } from "kafkajs";

export type KafkaTransportConfig = Omit<
	KafkaConfig,
	| "brokers"
	| "clientId"
	| "connectionTimeout"
	| "requestTimeout"
	| "enforceRequestTimeout"
	| "retry"
>;

export type KafkaTransaction = Pick<Transaction, "send" | "commit" | "abort">;

export type KafkaProducer = {
	transaction(): Promise<KafkaTransaction>;
};

export type KafkaProducerClient = KafkaProducer & {
	connect(): Promise<void>;
	disconnect(): Promise<void>;
};

export type KafkaProducerFactory = {
	producer(config: ProducerConfig): KafkaProducerClient;
};
