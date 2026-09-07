import type { ProducerConfig, Transaction } from "kafkajs";

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
