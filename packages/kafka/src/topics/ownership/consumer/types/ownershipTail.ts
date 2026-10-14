import type { ConsumerConfig } from "kafkajs";
import type { KafkaConsumerGroupTimings } from "../../../../client/types/kafkaLimits.js";
import type { KafkaConsumerClient } from "../../../../consumer/types/consumer.js";
import type { OwnershipRecord } from "../../types/ownershipRecord.js";

export type OwnershipTailRecord = {
	partition: number;
	offset: bigint;
	record: OwnershipRecord;
};

export type OwnershipTailListener = (record: OwnershipTailRecord) => void;

export type OwnershipTailView = {
	owner: string | null;
	activeDrain: { endpoint: string; successor: string } | null;
	activePreparation: { endpoint: string } | null;
};

export type OwnershipTail = {
	start(): Promise<void>;
	stop(): Promise<void>;
	tailPartition(params: {
		partition: number;
		onRecord: OwnershipTailListener;
		signal: AbortSignal;
	}): void;
	readView(params: { partition: number }): OwnershipTailView | null;
};

export type OwnershipTailKafka = {
	consumer(config: ConsumerConfig): KafkaConsumerClient;
};

export type OwnershipTailContext = {
	kafka: OwnershipTailKafka;
	onError?(failure: { cause: unknown }): void;
};

export type OwnershipTailConfig = {
	topic: string;
	groupIdPrefix?: string;
	startTimeoutMs?: number;
	timings?: KafkaConsumerGroupTimings;
};

export type OwnershipTailState = {
	status: "created" | "starting" | "started" | "stopped";
	listenersByPartition: Map<number, Set<OwnershipTailListener>>;
	viewByPartition: Map<number, OwnershipTailView>;
	removeListeners: Set<() => void>;
	stopping: Promise<void> | null;
};
