import type {
	Consumer,
	EachBatchPayload,
	IHeaders,
} from "../../client/types/kafkaWire.js";
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
	message: {
		offset: string;
		key: Buffer | null;
		value: Buffer | null;
		/** Record headers as Kafka delivered them; the owner epoch and fence markers ride here. */
		headers?: IHeaders;
	};
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
	settleBatch?(position: { topic: string; partition: number }): Promise<void>;
};

/** One partition's records, in order, sized by `recordsPerSlice`; the handler heartbeats through a long apply. */
export type TopicRecordSlice = {
	topic: string;
	partition: number;
	messages: TopicRecord["message"][];
	heartbeat: () => Promise<void>;
};

/** A handler that lands records a slice at a time; the slice's last offset is resolved once it returns. */
export type TopicRecordsHandler = {
	readResumeOffset(
		position: TopicResumePosition,
	): bigint | null | Promise<bigint | null>;
	applyRecords(slice: TopicRecordSlice): void | Promise<void>;
};

export type TopicConsumerHandler = TopicRecordHandler | TopicRecordsHandler;

export function isRecordsHandler(
	handler: TopicConsumerHandler,
): handler is TopicRecordsHandler {
	return "applyRecords" in handler;
}

export type TopicConsumer = {
	start(): Promise<void>;
	stop(): Promise<void>;
	/** Joins the group again after kafkajs gave it up; only between `start` and `stop`. */
	restart(): Promise<void>;
	withdrawPartition(position: { partition: number }): Promise<void>;
	resumePartition(position: { partition: number }): void;
	seekPartition(position: { partition: number; nextOffset: bigint }): void;
	pausePartition(position: { partition: number }): void;
	resumeFetching(position: { partition: number }): void;
	progress: ProgressTracker;
};

export type TopicConsumerConfig = {
	topic: string;
	/** Subscribed alongside `topic`; their records reach the handler with their own topic name. */
	secondaryTopics?: readonly string[];
	partitionsConsumedConcurrently?: number;
	/** Slice-mode handlers only: how many records land between one resolve-and-heartbeat and the next. */
	recordsPerSlice?: number;
	commitGroupOffsets?: boolean;
};

export type TopicConsumerDependencies = {
	consumer: KafkaConsumerClient;
	handler: TopicConsumerHandler;
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
