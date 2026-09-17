import type { Transaction } from "kafkajs";

export type KafkaTransaction = Pick<Transaction, "send" | "commit" | "abort">;

export type KafkaProducer = {
	transaction(): Promise<KafkaTransaction>;
};
