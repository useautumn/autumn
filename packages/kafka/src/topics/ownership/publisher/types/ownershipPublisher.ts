import type { KafkaProducer } from "../../../../client/types/kafkaClient.js";

export type OwnershipPublisherContext = {
	producer: KafkaProducer;
};

export type OwnershipClaim = {
	partition: number;
	endpoint: string;
	claimedAt: number;
};

export type OwnershipRelease = {
	partition: number;
	releasedAt: number;
};

export type OwnershipPublication = {
	routeEpoch: string;
};

export type OwnershipPublisher = {
	claim(params: OwnershipClaim): Promise<OwnershipPublication>;
	release(params: OwnershipRelease): Promise<OwnershipPublication>;
};
