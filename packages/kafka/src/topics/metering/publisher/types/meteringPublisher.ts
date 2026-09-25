import type {
	KafkaCommitMode,
	KafkaOffsetCommit,
	KafkaProducer,
} from "../../../../client/types/kafkaClient.js";
import type { MeteringRecord } from "../../types/meteringRecord.js";

export type MeteringPublisherContext = {
	producer: KafkaProducer;
	/** Defaults to transactional. */
	commit?: { mode: KafkaCommitMode };
	/** The ownership epoch this writer holds the partition under; written into each idempotent batch's records. */
	ownerEpoch?(): string | undefined;
	/** Where command offsets go when no transaction carries them: the consumer group's own commit. */
	commandOffsets?: { commit(offsets: KafkaOffsetCommit): Promise<void> };
};

export type MeteringAppend = {
	topic: string;
	partition: number;
	records: readonly MeteringRecord[];
	offsets?: KafkaOffsetCommit;
};

export type MeteringFence = {
	topic: string;
	partition: number;
	ownerEpoch: string;
};

export type MeteringPublisher = {
	append(params: MeteringAppend): Promise<{ baseOffset: bigint }>;
	/** Writes the owner's fence marker; null when the broker fences instead (a transactional producer). */
	fence(params: MeteringFence): Promise<{ offset: bigint } | null>;
};
