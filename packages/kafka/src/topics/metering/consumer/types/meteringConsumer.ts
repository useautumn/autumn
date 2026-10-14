import type {
	KafkaConsumerClient,
	TopicRecordHandler,
	TopicRecordResult,
	TopicResumePosition,
} from "../../../../consumer/types/consumer.js";
import type { ProgressTracker } from "../../../../consumer/types/progress.js";
import type { MeteringRecord } from "../../types/meteringRecord.js";

export type MeteringRecordApplication = {
	position: { topic: string; partition: number; offset: bigint };
	record: MeteringRecord;
	ownerEpoch?: bigint;
};

export type MeteringFenceApplication = {
	position: { topic: string; partition: number; offset: bigint };
	ownerEpoch: bigint;
};

export type MeteringStaleRecord = {
	position: { topic: string; partition: number; offset: bigint };
	ownerEpoch: bigint;
	fence: { epoch: bigint; offset: bigint };
};

export type MeteringRecordFailure = {
	topic: string;
	partition: number;
	offset: string;
	cause: unknown;
};

export type MeteringRecordHandler = {
	readResumeOffset(
		position: TopicResumePosition,
	): bigint | null | Promise<bigint | null>;
	shouldApply?(position: {
		topic: string;
		partition: number;
		offset: bigint;
	}): boolean;
	applyFence?(
		fence: MeteringFenceApplication,
	): TopicRecordResult | Promise<TopicRecordResult>;
	onStaleRecord?(record: MeteringStaleRecord): void;
	readOwnerFence?(position: {
		topic: string;
		partition: number;
	}):
		| MeteringStaleRecord["fence"]
		| null
		| Promise<MeteringStaleRecord["fence"] | null>;
	applyRecord(
		application: MeteringRecordApplication,
	): TopicRecordResult | Promise<TopicRecordResult>;
	onRecordError?(failure: MeteringRecordFailure): TopicRecordResult;
};

export type MeteringRecordSlice = {
	topic: string;
	partition: number;
	applications: MeteringRecordApplication[];
	heartbeat: () => Promise<void>;
};

export type MeteringRecordsHandler = {
	readResumeOffset(
		position: TopicResumePosition,
	): bigint | null | Promise<bigint | null>;
	shouldApply?(position: {
		topic: string;
		partition: number;
		offset: bigint;
	}): boolean;
	applyRecords(slice: MeteringRecordSlice): void | Promise<void>;
	parseRecord?(params: {
		key: Buffer | null;
		value: Buffer | null;
	}): MeteringRecord;
	onRecordError?(failure: MeteringRecordFailure): void;
	onStaleRecord?(record: MeteringStaleRecord): void;
	readOwnerFence?(position: {
		topic: string;
		partition: number;
	}):
		| MeteringStaleRecord["fence"]
		| null
		| Promise<MeteringStaleRecord["fence"] | null>;
};

export type MeteringConsumerHandler =
	| MeteringRecordHandler
	| MeteringRecordsHandler;

export type MeteringConsumerDependencies = {
	consumer: KafkaConsumerClient;
	handler: MeteringConsumerHandler;
	progress: ProgressTracker;
	secondaryHandlers?: Readonly<Record<string, TopicRecordHandler>>;
};
