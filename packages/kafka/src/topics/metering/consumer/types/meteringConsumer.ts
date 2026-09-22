import type {
	KafkaConsumerClient,
	TopicRecordResult,
	TopicResumePosition,
} from "../../../../consumer/types/consumer.js";
import type { ProgressTracker } from "../../../../consumer/types/progress.js";
import type { MeteringRecord } from "../../types/meteringRecord.js";

export type MeteringRecordApplication = {
	position: { topic: string; partition: number; offset: bigint };
	record: MeteringRecord;
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
	applyRecord(
		application: MeteringRecordApplication,
	): TopicRecordResult | Promise<TopicRecordResult>;
	/** Throws to fail the batch, or returns a result to stand in for the record's own. */
	onRecordError?(failure: MeteringRecordFailure): TopicRecordResult;
};

export type MeteringConsumerDependencies = {
	consumer: KafkaConsumerClient;
	handler: MeteringRecordHandler;
	progress: ProgressTracker;
};
