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

/** One consumer per worker following the ownership log from where it stood at
 *  start; a partition tail is a listener on it, never a consumer of its own. */
export type OwnershipTail = {
	start(): Promise<void>;
	stop(): Promise<void>;
	/** Delivers every record the tail reads for `partition` until `signal` aborts. */
	tailPartition(params: {
		partition: number;
		onRecord: OwnershipTailListener;
		signal: AbortSignal;
	}): void;
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
	/** How long start waits for the first fetch, which is when the position settles at the log end. */
	startTimeoutMs?: number;
	timings?: KafkaConsumerGroupTimings;
};

export type OwnershipTailState = {
	status: "created" | "starting" | "started" | "stopped";
	listenersByPartition: Map<number, Set<OwnershipTailListener>>;
	removeListeners: (() => void)[];
	stopping: Promise<void> | null;
};
