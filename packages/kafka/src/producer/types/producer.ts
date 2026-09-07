import type { KafkaTransaction } from "../../client/types/kafkaClient.js";
import type { KafkaProducerLimits } from "../../client/types/kafkaLimits.js";

export type KafkaProducerSession = {
	connect(): Promise<void>;
	fence(): Promise<void>;
	transaction(): Promise<KafkaTransaction>;
	isUsable(): boolean;
	disconnect(params?: { waitForTransactions?: boolean }): Promise<void>;
};

export type KafkaProducerSessionConfig = {
	transactionalId: string;
	limits: KafkaProducerLimits;
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
