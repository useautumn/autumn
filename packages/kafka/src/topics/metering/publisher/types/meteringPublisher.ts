import type { KafkaProducer } from "../../../../client/types/kafkaClient.js";
import type { MeteringRecord } from "../../types/meteringRecord.js";

export type MeteringPublisherContext = {
	producer: KafkaProducer;
};

export type MeteringAppend = {
	topic: string;
	partition: number;
	records: readonly MeteringRecord[];
};

export type MeteringPublisher = {
	append(params: MeteringAppend): Promise<{ baseOffset: bigint }>;
};
