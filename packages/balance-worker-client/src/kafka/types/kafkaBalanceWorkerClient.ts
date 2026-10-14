import type {
	KafkaSaslCredentials,
	KafkaSender,
	OwnershipKafka,
} from "@autumn/kafka";
import type { ProducerConfig } from "kafkajs";
import type { PartitionOwners } from "../../routing/types/routing.js";

export type BalanceWorkerProducer = KafkaSender & {
	connect(): Promise<void>;
	disconnect(): Promise<void>;
};

export type BalanceWorkerKafka = OwnershipKafka & {
	producer(config: ProducerConfig): BalanceWorkerProducer;
};

export type BalanceWorkerKafkaConfig = {
	clientId: string;
	brokers: string[];
	authMode: "none" | "msk_iam" | "scram" | "plain";
	region?: string;
	sasl?: KafkaSaslCredentials;
};

type LogMethod = (payload: object | string, message?: string) => void;
export type ClientLogger = {
	info: LogMethod;
	warn: LogMethod;
	error: LogMethod;
};

export type OwnersFromKafka = PartitionOwners & {
	start(): Promise<void>;
	stop(): Promise<void>;
};

export type OwnersFromKafkaConfig = {
	topic: string;
	groupIdPrefix: string;
	catchUpTimeoutMs?: number;
	startRetryDelaysMs?: readonly number[];
};

export type KafkaBalanceWorkerClientConfig = {
	kafka: BalanceWorkerKafkaConfig;
	ownershipTopic: string;
	commandTopic: string;
	catalogInvalidationTopic: string;
	groupIdPrefix: string;
	partitionCount: number;
	timeoutMs: number;
	appendTimeoutMs?: number;
	routeRefreshTimeoutMs?: number;
	batchTracks?: boolean;
	maxTrackBatchSize?: number;
	catchUpTimeoutMs?: number;
	startRetryDelaysMs?: readonly number[];
	connectProducersOnStart?: boolean;
};
