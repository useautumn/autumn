import type {
	KafkaProducer,
	KafkaSender,
} from "../../../../client/types/kafkaClient.js";

export type OwnershipPublisherContext = {
	producer: KafkaProducer;
	/** A plain producer for `ready` and `draining`; without one the publisher can only claim and release. */
	sender?: KafkaSender;
};

export type OwnershipReadinessContext = {
	sender: KafkaSender;
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

export type OwnershipReadiness = {
	partition: number;
	/** The worker that has prepared the partition and is waiting to be named its owner. */
	endpoint: string;
	readyAt: number;
};

export type OwnershipDraining = {
	partition: number;
	/** The owner that has withdrawn and is draining before naming its successor. */
	endpoint: string;
	successor: string;
	drainingAt: number;
};

export type OwnershipPublication = {
	routeEpoch: string;
};

export type OwnershipPublisher = {
	claim(params: OwnershipClaim): Promise<OwnershipPublication>;
	release(params: OwnershipRelease): Promise<OwnershipPublication>;
	announceReady(params: OwnershipReadiness): Promise<void>;
	announceDraining(params: OwnershipDraining): Promise<void>;
};
