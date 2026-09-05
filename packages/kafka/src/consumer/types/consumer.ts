import type { Consumer, EachBatchPayload } from "kafkajs";
import type { ProgressTracker } from "./progress.js";

export type KafkaConsumerClient = Pick<
	Consumer,
	| "connect"
	| "subscribe"
	| "run"
	| "commitOffsets"
	| "seek"
	| "pause"
	| "resume"
	| "stop"
	| "disconnect"
	| "events"
	| "on"
>;

export type TopicRecord = {
	topic: string;
	partition: number;
	message: { offset: string; key: Buffer | null; value: Buffer | null };
};

// biome-ignore lint/suspicious/noConfusingVoidType: Handlers may apply records without returning an offset.
export type TopicRecordResult = void | { nextOffset: bigint };
export type TopicResumePosition = {
	topic: string;
	partition: number;
	firstOffset: bigint;
};

export type TopicRecordHandler = {
	readResumeOffset(
		position: TopicResumePosition,
	): bigint | null | Promise<bigint | null>;
	applyRecord(
		record: TopicRecord,
	): TopicRecordResult | Promise<TopicRecordResult>;
};

export type TopicConsumer = {
	start(): Promise<void>;
	stop(): Promise<void>;
	withdrawPartition(position: { partition: number }): Promise<void>;
	resumePartition(position: { partition: number }): void;
	seekPartition(position: { partition: number; nextOffset: bigint }): void;
	pausePartition(position: { partition: number }): void;
	resumeFetching(position: { partition: number }): void;
	progress: ProgressTracker;
};

export type TopicConsumerConfig = {
	topic: string;
	partitionsConsumedConcurrently?: number;
};

export type TopicConsumerDependencies = {
	consumer: KafkaConsumerClient;
	handler: TopicRecordHandler;
	progress: ProgressTracker;
};

export interface TopicConsumerContext extends TopicConsumerDependencies {
	config: TopicConsumerConfig;
}

export type TopicConsumerState = {
	isStarted: boolean;
	isStopped: boolean;
	removeGroupJoinListener: (() => void) | null;
	removeEndBatchProcessListener: (() => void) | null;
	initializedPartitions: Set<string>;
	withdrawnPartitions: Set<number>;
	partitionGenerations: Map<number, number>;
	activeBatches: Map<number, Set<Promise<void>>>;
};

export type TopicBatchParams = {
	ctx: TopicConsumerContext;
	state: TopicConsumerState;
	payload: EachBatchPayload;
	generation: number;
};
