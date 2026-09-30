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

/** A record a superseded owner wrote after a higher epoch's fence: dropped, whoever is reading. */
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
	/** Asked before the record is decoded; false passes it unread, as if applied. Absent, every record is applied. */
	shouldApply?(position: {
		topic: string;
		partition: number;
		offset: bigint;
	}): boolean;
	/** A fence marker in the log; absent, the consumer keeps the fence itself and drops what a lower epoch writes after it. */
	applyFence?(
		fence: MeteringFenceApplication,
	): TopicRecordResult | Promise<TopicRecordResult>;
	/** Told of every record the consumer dropped as a stale owner's; only when `applyFence` is absent. */
	onStaleRecord?(record: MeteringStaleRecord): void;
	applyRecord(
		application: MeteringRecordApplication,
	): TopicRecordResult | Promise<TopicRecordResult>;
	/** Throws to fail the batch, or returns a result to stand in for the record's own. */
	onRecordError?(failure: MeteringRecordFailure): TopicRecordResult;
};

/** One partition's decoded records, in order; fence markers and records the handler declined are already gone. */
export type MeteringRecordSlice = {
	topic: string;
	partition: number;
	applications: MeteringRecordApplication[];
	heartbeat: () => Promise<void>;
};

/** Lands records a slice at a time: one store round trip per slice, one resolve-and-heartbeat after it. */
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
	/** A record that will not decode: throw to fail the slice, or return to drop that one record. */
	onRecordError?(failure: MeteringRecordFailure): void;
	/** Told of every record the consumer dropped as a stale owner's. */
	onStaleRecord?(record: MeteringStaleRecord): void;
};

export type MeteringConsumerHandler =
	| MeteringRecordHandler
	| MeteringRecordsHandler;

export type MeteringConsumerDependencies = {
	consumer: KafkaConsumerClient;
	handler: MeteringConsumerHandler;
	progress: ProgressTracker;
	/** Other topics on the same group membership, each with its own raw record handler. */
	secondaryHandlers?: Readonly<Record<string, TopicRecordHandler>>;
};
