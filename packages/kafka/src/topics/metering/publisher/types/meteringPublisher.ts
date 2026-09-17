import type { TrackOutcome } from "@autumn/balance-engine";
import type { KafkaProducer } from "../../../../client/types/kafkaClient.js";

export type MeteringPublisherContext = {
	producer: KafkaProducer;
};

export type MeteringAppend = {
	topic: string;
	partition: number;
	records: readonly TrackOutcome[];
};

export type MeteringPublisher = {
	append(params: MeteringAppend): Promise<{ baseOffset: bigint }>;
};
