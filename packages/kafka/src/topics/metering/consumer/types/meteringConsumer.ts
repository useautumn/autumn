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
	/** The ownership epoch the record was written under; absent for a transactional write. */
	ownerEpoch?: bigint;
};

/** An ownership fence marker: from here on, records from a lower epoch are a stale owner's. */
export type MeteringFenceApplication = {
	position: { topic: string; partition: number; offset: bigint };
	ownerEpoch: bigint;
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
	/** Asked before the record is decoded; false passes it unread, as if applied. Absent, every record is applied. */
	shouldApply?(position: {
		topic: string;
		partition: number;
		offset: bigint;
	}): boolean;
	/** A fence marker in the log; absent, markers pass unread. */
	applyFence?(
		fence: MeteringFenceApplication,
	): TopicRecordResult | Promise<TopicRecordResult>;
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
	/** Other topics on the same group membership, each with its own raw record handler. */
	secondaryHandlers?: Readonly<Record<string, TopicRecordHandler>>;
};
