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

export type KafkaSaslCredentials = {
	mechanism: "scram-sha-256" | "scram-sha-512" | "plain";
	username: string;
	password: string;
};

export type KafkaTransaction = Pick<
	Transaction,
	"send" | "sendOffsets" | "commit" | "abort"
>;

export type KafkaSender = Pick<Producer, "send">;

export type KafkaCommitMode = "transactional" | "idempotent";

export type KafkaProducer = {
	transaction(): Promise<KafkaTransaction>;
	send?: KafkaSender["send"];
	readonly mode?: KafkaCommitMode;
};

export type KafkaRequestTiming = {
	apiName: string;
	broker: string;
	durationMs: number;
	pendingMs: number;
};

export type KafkaProducerClient = KafkaProducer & {
	send?: KafkaSender["send"];
	connect(): Promise<void>;
	disconnect(): Promise<void>;
	on?: Producer["on"];
	events?: Pick<Producer["events"], "REQUEST">;
};

export type KafkaProducerFactory = {
	producer(config: ProducerConfig): KafkaProducerClient;
};

export type KafkaOffsetCommit = Parameters<Transaction["sendOffsets"]>[0];
