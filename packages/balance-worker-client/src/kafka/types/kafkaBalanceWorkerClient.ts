import type { KafkaSender, OwnershipKafka } from "@autumn/kafka";
import type { ProducerConfig } from "kafkajs";
import type { PartitionOwners } from "../../routing/types/routing.js";

export type BalanceWorkerProducer = KafkaSender & {
	connect(): Promise<void>;
	disconnect(): Promise<void>;
};

/** The two things a process needs from Kafka to reach its workers: who owns what, and a queue. */
export type BalanceWorkerKafka = OwnershipKafka & {
	producer(config: ProducerConfig): BalanceWorkerProducer;
};

export type BalanceWorkerKafkaConfig = {
	clientId: string;
	brokers: string[];
	authMode: "none" | "msk_iam";
	region?: string;
};

type LogMethod = (payload: object | string, message?: string) => void;
export type ClientLogger = {
	info: LogMethod;
	warn: LogMethod;
	error: LogMethod;
};

/** Owners that answer nothing until the ownership log has been read through once. */
export type OwnersFromKafka = PartitionOwners & {
	start(): Promise<void>;
	stop(): Promise<void>;
};

export type OwnersFromKafkaConfig = {
	topic: string;
	groupIdPrefix: string;
	catchUpTimeoutMs?: number;
	/** How long each failed start waits before the next; the last entry repeats. */
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
	/** A process that queues or publishes connects its producers at start, so no first call pays the connect. Off for one that never appends. */
	connectProducersOnStart?: boolean;
};
