import type {
	KafkaConfig,
	Producer,
	ProducerConfig,
	Transaction,
} from "kafkajs";

export type KafkaTransportConfig = Omit<
	KafkaConfig,
	| "brokers"
	| "clientId"
	| "connectionTimeout"
	| "requestTimeout"
	| "enforceRequestTimeout"
	| "retry"
>;

export type KafkaTransaction = Pick<
	Transaction,
	"send" | "sendOffsets" | "commit" | "abort"
>;

/** A plain producer: sends outside any transaction. */
export type KafkaSender = Pick<Producer, "send">;

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

export type KafkaOffsetCommit = Parameters<Transaction["sendOffsets"]>[0];
