import type { Consumer, ConsumerConfig } from "kafkajs";

export type PartitionReaderConsumer = Pick<
	Consumer,
	| "connect"
	| "disconnect"
	| "subscribe"
	| "run"
	| "stop"
	| "pause"
	| "seek"
	| "on"
	| "events"
>;

export type PartitionReaderKafka = {
	consumer(config: ConsumerConfig): PartitionReaderConsumer;
};

export type PartitionLogRecord = {
	partition: number;
	offset: bigint;
	key: Buffer | null;
	value: Buffer | null;
};

export type PartitionReadRange = {
	partition: number;
	fromOffset: bigint;
	toOffset: bigint;
	signal?: AbortSignal;
	timeoutMs?: number;
};

export type PartitionReaderConfig = {
	topic: string;
	groupIdPrefix?: string;
};

export type PartitionReader = {
	readRange(params: PartitionReadRange): Promise<readonly PartitionLogRecord[]>;
	disconnect(): Promise<void>;
};

export type PartitionReadState = {
	running?: Promise<void>;
	cleanupFailure?: unknown;
};

export type ActivePartitionRead = {
	reading: Promise<readonly PartitionLogRecord[]>;
	state: PartitionReadState;
};
