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

/** One request to a broker, as kafkajs instruments it. */
export type KafkaRequestTiming = {
	apiName: string;
	broker: string;
	/** Sent to response. */
	durationMs: number;
	/** Queued in the client before it was sent. */
	pendingMs: number;
};

export type KafkaProducerClient = KafkaProducer & {
	connect(): Promise<void>;
	disconnect(): Promise<void>;
	/** kafkajs instrumentation; absent on test doubles. */
	on?: Producer["on"];
	events?: Pick<Producer["events"], "REQUEST">;
};

export type KafkaProducerFactory = {
	producer(config: ProducerConfig): KafkaProducerClient;
};

export type KafkaOffsetCommit = Parameters<Transaction["sendOffsets"]>[0];
