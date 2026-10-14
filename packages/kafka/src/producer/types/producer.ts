import type {
	KafkaCommitMode,
	KafkaSender,
	KafkaTransaction,
} from "../../client/types/kafkaClient.js";
import type { KafkaProducerLimits } from "../../client/types/kafkaLimits.js";

export type KafkaProducerSession = {
	connect(): Promise<void>;
	fence(): Promise<void>;
	transaction(): Promise<KafkaTransaction>;
	send: KafkaSender["send"];
	isUsable(): boolean;
	disconnect(params?: { waitForTransactions?: boolean }): Promise<void>;
	readonly mode: KafkaCommitMode;
};

export type KafkaProducerSessionConfig = {
	transactionalId: string;
	limits: KafkaProducerLimits;
	mode?: KafkaCommitMode;
};

export type ProducerSessionState = {
	initialized: boolean;
	closed: boolean;
	terminal: boolean;
	transactions: Promise<void>;
};

export type KafkaProducerErrorMetadata = {
	type?: unknown;
	code?: unknown;
	cause?: unknown;
	abortCause?: unknown;
	errors?: unknown;
};
