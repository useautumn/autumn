/** The slice of librdkafka's native consumer (node-rdkafka's API) the runner drives; tests stand in for it. */
export type NativeTopicPartition = { topic: string; partition: number };
export type NativeTopicPartitionOffset = NativeTopicPartition & {
	offset: number;
};

export type NativeMessage = NativeTopicPartitionOffset & {
	key?: Buffer | string | null;
	value: Buffer | null;
	size?: number;
	timestamp?: number;
	headers?: Array<Record<string, Buffer | string>>;
};

export type NativeKafkaError = Error & {
	code?: number;
	isFatal?: boolean;
	isRetriable?: boolean;
};

type Done = (error: NativeKafkaError | null | undefined) => void;

export type NativeConsumer = {
	connect(options: object, done: Done): unknown;
	disconnect(done: Done): unknown;
	subscribe(topics: string[]): unknown;
	unsubscribe(): unknown;
	setDefaultConsumeTimeout(timeoutMs: number): void;
	setDefaultIsTimeoutOnlyForFirstMessage(
		isTimeoutOnlyForFirstMessage: boolean,
	): void;
	consume(
		count: number,
		done: (error: NativeKafkaError | null, messages: NativeMessage[]) => void,
	): void;
	assign(assignments: NativeTopicPartition[]): unknown;
	unassign(): unknown;
	incrementalAssign(assignments: NativeTopicPartition[]): unknown;
	incrementalUnassign(assignments: NativeTopicPartition[]): unknown;
	rebalanceProtocol(): string;
	seek(
		position: NativeTopicPartitionOffset,
		timeoutMs: number,
		done: Done,
	): unknown;
	pause(partitions: NativeTopicPartition[]): unknown;
	resume(partitions: NativeTopicPartition[]): unknown;
	commitCb(offsets: NativeTopicPartitionOffset[], done: Done): unknown;
	committed(
		partitions: NativeTopicPartition[],
		timeoutMs: number,
		done: (
			error: NativeKafkaError | null,
			offsets: NativeTopicPartitionOffset[],
		) => void,
	): unknown;
	getWatermarkOffsets(
		topic: string,
		partition: number,
	): { highOffset?: number; lowOffset?: number };
	on(event: string, listener: (...args: never[]) => void): unknown;
};

export type NativeRebalanceCallback = (
	error: NativeKafkaError,
	assignment: NativeTopicPartition[],
) => void;

/** Builds a native consumer from its global and topic properties; the runner owns its rebalance callback. */
export type NativeConsumerFactory = (params: {
	global: Record<string, unknown>;
	topic: Record<string, unknown>;
}) => NativeConsumer;
