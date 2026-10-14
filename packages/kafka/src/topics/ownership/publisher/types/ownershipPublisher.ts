import type {
	KafkaProducer,
	KafkaSender,
} from "../../../../client/types/kafkaClient.js";
import type { TransactionRetry } from "../../../../producer/sendTransactionalBatch.js";

export type OwnershipPublisherContext = {
	producer: KafkaProducer;
	sender?: KafkaSender;
	retry?: TransactionRetry;
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
	endpoint: string;
};

export type OwnershipReadiness = {
	partition: number;
	endpoint: string;
	readyAt: number;
};

export type OwnershipDraining = {
	partition: number;
	endpoint: string;
	successor: string;
	drainingAt: number;
};

export type OwnershipPreparation = {
	partition: number;
	endpoint: string;
	preparingAt: number;
};

export type OwnershipPublication = {
	routeEpoch: string;
};

export type OwnershipPublisher = {
	claim(params: OwnershipClaim): Promise<OwnershipPublication>;
	release(params: OwnershipRelease): Promise<OwnershipPublication>;
	announceReady(params: OwnershipReadiness): Promise<void>;
	announceDraining(params: OwnershipDraining): Promise<void>;
	announcePreparing(params: OwnershipPreparation): Promise<void>;
};
