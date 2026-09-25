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

/**
 * How a partition's writer commits a batch: inside a transaction (three
 * broker round trips, the broker fences a stale owner) or as one idempotent
 * produce (one round trip, the owner's epoch rides in a header instead).
 */
export type KafkaCommitMode = "transactional" | "idempotent";

export type KafkaProducer = {
	transaction(): Promise<KafkaTransaction>;
	/** A plain idempotent send; absent on a producer that only speaks transactions. */
	send?: KafkaSender["send"];
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
	send?: KafkaSender["send"];
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
