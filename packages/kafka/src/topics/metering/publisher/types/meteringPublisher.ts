import type {
	KafkaCommitMode,
	KafkaOffsetCommit,
	KafkaProducer,
} from "../../../../client/types/kafkaClient.js";
import type { MeteringRecord } from "../../types/meteringRecord.js";

export type MeteringPublisherContext = {
	producer: KafkaProducer;
	commit?: { mode: KafkaCommitMode };
	ownerEpoch?(): string | undefined;
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
	fence(params: MeteringFence): Promise<{ offset: bigint } | null>;
};
