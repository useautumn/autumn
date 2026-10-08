import type {
	KafkaRequestTiming,
	Producer,
	ProducerConfig,
	Transaction,
} from "./kafkaWire.js";

export type { KafkaRequestTiming };

export type KafkaSaslCredentials = {
	mechanism: "scram-sha-256" | "scram-sha-512" | "plain";
	username: string;
	password: string;
};

export type KafkaTransportConfig = {
	ssl?: boolean;
	sasl?: KafkaSaslCredentials;
};

export type KafkaLogLevel = "error" | "warn" | "info" | "debug";

/** Where librdkafka's own log lines go; one line per call, already JSON. */
export type KafkaLogSink = Record<KafkaLogLevel, (line: string) => void>;

export type KafkaClientConfig = KafkaTransportConfig & {
	clientId: string;
	brokers: string[];
	connectionTimeout: number;
	requestTimeout: number;
	retry: { retries: number; initialRetryTime: number; maxRetryTime: number };
	logSink?: KafkaLogSink;
};

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
	/** How this producer commits; absent means transactional. */
	readonly mode?: KafkaCommitMode;
};

export type KafkaProducerClient = KafkaProducer & {
	send?: KafkaSender["send"];
	connect(): Promise<void>;
	disconnect(): Promise<void>;
	/** Called once per broker per statistics window; absent on test doubles. */
	onRequestTimings?(listener: (timing: KafkaRequestTiming) => void): void;
};

export type KafkaProducerFactory = {
	producer(config: ProducerConfig): KafkaProducerClient;
};

export type KafkaOffsetCommit = Parameters<Transaction["sendOffsets"]>[0];
