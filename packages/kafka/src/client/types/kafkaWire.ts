/**
 * The Kafka shapes Autumn's code speaks. They keep kafkajs's names and fields, which every caller was
 * written against, while librdkafka (`./librdkafka/`) serves them.
 */

export type IHeaders = {
	[key: string]: Buffer | string | (Buffer | string)[] | undefined;
};

export const CompressionTypes = {
	None: 0,
	GZIP: 1,
	Snappy: 2,
	LZ4: 3,
	ZSTD: 4,
} as const;
export type CompressionType =
	(typeof CompressionTypes)[keyof typeof CompressionTypes];

export type Message = {
	key?: Buffer | string | null;
	value: Buffer | string | null;
	partition?: number;
	headers?: IHeaders;
	timestamp?: string;
};

/** `acks` and `compression` are fixed per producer; a send may restate them but not change them. */
export type ProducerRecord = {
	topic: string;
	messages: Message[];
	acks?: -1;
	compression?: CompressionType;
	timeout?: number;
};

export type RecordMetadata = {
	topicName: string;
	partition: number;
	errorCode: number;
	baseOffset?: string;
	offset?: string;
	timestamp?: string;
	logAppendTime?: string;
	logStartOffset?: string;
};

export type KafkaMessage = {
	key: Buffer | null;
	value: Buffer | null;
	timestamp: string;
	attributes: number;
	offset: string;
	headers?: IHeaders;
	size?: number;
};

export type Batch = {
	topic: string;
	partition: number;
	highWatermark: string;
	messages: KafkaMessage[];
	isEmpty(): boolean;
	firstOffset(): string | null;
	lastOffset(): string;
};

export type TopicOffsets = {
	topic: string;
	partitions: { partition: number; offset: string }[];
};

export type OffsetsByTopicPartition = { topics: TopicOffsets[] };

export type TopicPartitionOffset = {
	topic: string;
	partition: number;
	offset: string;
};

export type EachBatchPayload = {
	batch: Batch;
	resolveOffset(offset: string): void;
	/** Throws once the batch's partition was revoked: whatever the handler writes next would be under a lost lease. */
	heartbeat(): Promise<void>;
	pause(): () => void;
	commitOffsetsIfNecessary(offsets?: OffsetsByTopicPartition): Promise<void>;
	uncommittedOffsets(): OffsetsByTopicPartition;
	isRunning(): boolean;
	isStale(): boolean;
};

export type EachMessagePayload = {
	topic: string;
	partition: number;
	message: KafkaMessage;
	heartbeat(): Promise<void>;
	pause(): () => void;
};

export type EachBatchHandler = (payload: EachBatchPayload) => Promise<void>;
export type EachMessageHandler = (payload: EachMessagePayload) => Promise<void>;

export type ConsumerRunConfig = {
	autoCommit?: boolean;
	eachBatchAutoResolve?: boolean;
	partitionsConsumedConcurrently?: number;
	eachBatch?: EachBatchHandler;
	eachMessage?: EachMessageHandler;
};

export type ConsumerSubscribeTopics = {
	topics: string[];
	fromBeginning?: boolean;
};

export const ConsumerEventNames = {
	GROUP_JOIN: "consumer.group_join",
	REBALANCING: "consumer.rebalancing",
	CRASH: "consumer.crash",
	FETCH: "consumer.fetch",
	END_BATCH_PROCESS: "consumer.end_batch_process",
} as const;
export type ConsumerEvents = typeof ConsumerEventNames;
export type ConsumerEventName = ConsumerEvents[keyof ConsumerEvents];

type ConsumerEvent<Type extends ConsumerEventName, Payload> = {
	type: Type;
	timestamp: number;
	payload: Payload;
};

export type ConsumerGroupJoinEvent = ConsumerEvent<
	ConsumerEvents["GROUP_JOIN"],
	{ groupId: string; memberAssignment: Record<string, number[]> }
>;
export type ConsumerRebalancingEvent = ConsumerEvent<
	ConsumerEvents["REBALANCING"],
	{ groupId: string }
>;
export type ConsumerCrashEvent = ConsumerEvent<
	ConsumerEvents["CRASH"],
	{ groupId: string; error: Error; restart: boolean }
>;
export type ConsumerFetchEvent = ConsumerEvent<
	ConsumerEvents["FETCH"],
	{ numberOfBatches: number }
>;
export type ConsumerEndBatchProcessEvent = ConsumerEvent<
	ConsumerEvents["END_BATCH_PROCESS"],
	{
		topic: string;
		partition: number;
		highWatermark: string;
		/** Zero when the consumer passed only filtered records and transaction markers to reach the log end. */
		batchSize: number;
		lastOffset: string;
	}
>;

export type ConsumerEventByName = {
	"consumer.group_join": ConsumerGroupJoinEvent;
	"consumer.rebalancing": ConsumerRebalancingEvent;
	"consumer.crash": ConsumerCrashEvent;
	"consumer.fetch": ConsumerFetchEvent;
	"consumer.end_batch_process": ConsumerEndBatchProcessEvent;
};

export type Consumer = {
	connect(): Promise<void>;
	subscribe(subscription: ConsumerSubscribeTopics): Promise<void>;
	run(config: ConsumerRunConfig): Promise<void>;
	commitOffsets(offsets: TopicPartitionOffset[]): Promise<void>;
	seek(position: TopicPartitionOffset): void;
	pause(topics: { topic: string; partitions?: number[] }[]): void;
	resume(topics: { topic: string; partitions?: number[] }[]): void;
	stop(): Promise<void>;
	disconnect(): Promise<void>;
	readonly events: ConsumerEvents;
	on<Name extends ConsumerEventName>(
		event: Name,
		listener: (event: ConsumerEventByName[Name]) => void,
	): () => void;
};

/** Which consumer group protocol a group speaks. `consumer` is KIP-848: incremental, assigned by the broker. */
export type GroupProtocol = "consumer" | "classic";

export type ConsumerConfig = {
	groupId: string;
	/** Defaults to `consumer`. */
	groupProtocol?: GroupProtocol;
	/** KIP-848's broker-side assignor; `range` co-partitions topics of equal partition count. */
	remoteAssignor?: "range" | "uniform";
	readUncommitted?: boolean;
	allowAutoTopicCreation?: boolean;
	maxWaitTimeInMs?: number;
	/** Classic protocol only; under `consumer` the broker sets both. */
	heartbeatInterval?: number;
	sessionTimeout?: number;
	/** How long a member may take to give back revoked partitions before the group evicts it. */
	rebalanceTimeout?: number;
	retry?: {
		/** False ends the consumer after a failed batch instead of rewinding to the last commit. */
		restartOnFailure?: (error: Error) => Promise<boolean>;
		initialRetryTime?: number;
	};
};

export type ProducerConfig = {
	transactionalId?: string;
	idempotent?: boolean;
	maxInFlightRequests?: number;
	transactionTimeout?: number;
	allowAutoTopicCreation?: boolean;
	retry?: {
		retries?: number;
		initialRetryTime?: number;
		maxRetryTime?: number;
	};
	/** Applied to every send; defaults to GZIP, what every send of ours asked kafkajs for. */
	compression?: CompressionType;
	/** How long a send waits for the rest of its records before going out; defaults to 1ms. */
	lingerMs?: number;
};

export type Transaction = {
	send(record: ProducerRecord): Promise<RecordMetadata[]>;
	sendOffsets(offsets: {
		consumer: Consumer;
		topics: TopicOffsets[];
	}): Promise<void>;
	commit(): Promise<void>;
	abort(): Promise<void>;
};

/** One broker's request latency over a statistics window, as librdkafka reports it. */
export type KafkaRequestTiming = {
	apiName: string;
	broker: string;
	/** Sent to response, the window's average. */
	durationMs: number;
	/** Queued in the client before it was sent, the window's average. */
	pendingMs: number;
};

export type Producer = {
	/** Called once per broker per statistics window; absent on test doubles. */
	onRequestTimings?(listener: (timing: KafkaRequestTiming) => void): void;
	connect(): Promise<void>;
	disconnect(): Promise<void>;
	send(record: ProducerRecord): Promise<RecordMetadata[]>;
	transaction(): Promise<Transaction>;
};

export type ITopicMetadata = {
	name: string;
	partitions: {
		partitionId: number;
		leader: number;
		replicas: number[];
		isr: number[];
	}[];
};

export type ITopicConfig = {
	topic: string;
	numPartitions?: number;
	replicationFactor?: number;
	configEntries?: { name: string; value: string }[];
};

export type Admin = {
	connect(): Promise<void>;
	disconnect(): Promise<void>;
	createTopics(options: {
		topics: ITopicConfig[];
		timeout?: number;
	}): Promise<boolean>;
	deleteTopics(options: { topics: string[]; timeout?: number }): Promise<void>;
	/** Moves each partition's log start up to `offset`. */
	deleteTopicRecords(options: {
		topic: string;
		partitions: { partition: number; offset: string }[];
	}): Promise<void>;
	listTopics(): Promise<string[]>;
	fetchTopicMetadata(options?: {
		topics?: string[];
	}): Promise<{ topics: ITopicMetadata[] }>;
	/** `high` is the last stable offset under read-committed, which every reader of ours uses. */
	fetchTopicOffsets(
		topic: string,
	): Promise<
		{ partition: number; offset: string; high: string; low: string }[]
	>;
	/** Per partition, the first offset at or after `timestamp`; "-1" where there is none. */
	fetchTopicOffsetsByTimestamp(
		topic: string,
		timestamp: number,
	): Promise<{ partition: number; offset: string }[]>;
	fetchOffsets(options: {
		groupId: string;
		topics: string[];
	}): Promise<
		{ topic: string; partitions: { partition: number; offset: string }[] }[]
	>;
	/** Commits a group's offsets from outside it; only an empty group accepts them. */
	setOffsets(options: {
		groupId: string;
		topic: string;
		partitions: { partition: number; offset: string }[];
	}): Promise<void>;
};

export type Kafka = {
	producer(config?: ProducerConfig): Producer;
	consumer(config: ConsumerConfig): Consumer;
	admin(): Admin;
};
