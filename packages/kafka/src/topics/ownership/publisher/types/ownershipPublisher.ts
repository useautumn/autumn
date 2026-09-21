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
	/** The releasing worker, so a consumer can refuse a release from a worker that
	 *  no longer holds the partition. */
	endpoint: string;
};

export type OwnershipPublication = {
	routeEpoch: string;
};

export type OwnershipPublisher = {
	claim(params: OwnershipClaim): Promise<OwnershipPublication>;
	release(params: OwnershipRelease): Promise<OwnershipPublication>;
};
