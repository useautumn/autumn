import type {
	KafkaCommitMode,
	KafkaSender,
	KafkaTransaction,
} from "../../client/types/kafkaClient.js";
import type { KafkaProducerLimits } from "../../client/types/kafkaLimits.js";

export type KafkaProducerSession = {
	connect(): Promise<void>;
	/** Transactional: bumps the epoch so a stale owner's writes are refused. Idempotent: nothing to bump, the session is simply ready. */
	fence(): Promise<void>;
	transaction(): Promise<KafkaTransaction>;
	/** A plain idempotent send; only an idempotent session offers one. */
	send: KafkaSender["send"];
	isUsable(): boolean;
	disconnect(params?: { waitForTransactions?: boolean }): Promise<void>;
	readonly mode: KafkaCommitMode;
};

export type KafkaProducerSessionConfig = {
	transactionalId: string;
	limits: KafkaProducerLimits;
	/** Defaults to transactional. */
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
