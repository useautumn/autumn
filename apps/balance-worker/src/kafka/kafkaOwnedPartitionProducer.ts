import type { ProducerConfig } from "kafkajs";
import type { KafkaTrackOutcomeProducerPort } from "./kafkaCommittedTrackOutcomeAppender.js";

export type KafkaOwnedPartitionProducerPort = KafkaTrackOutcomeProducerPort & {
	connect(): Promise<void>;
	disconnect(): Promise<void>;
};

export type KafkaOwnedPartitionProducerLimits = {
	transactionTimeoutMs: number;
	retryCount: number;
	initialRetryTimeMs: number;
	maxRetryTimeMs: number;
};

export type KafkaProducerFactoryPort = {
	producer(config: ProducerConfig): KafkaOwnedPartitionProducerPort;
};

const maximumKafkaProducerRetryCount = 10;

const assertNonEmpty = ({
	name,
	value,
}: {
	name: string;
	value: string;
}): void => {
	if (value.trim().length === 0) throw new Error(`${name} cannot be empty`);
};

const assertPositiveSafeInteger = ({
	name,
	value,
}: {
	name: string;
	value: number;
}): void => {
	if (!Number.isSafeInteger(value) || value <= 0) {
		throw new RangeError(`${name} must be a positive safe integer`);
	}
};

const validateProducerConfiguration = ({
	deploymentEnvironment,
	topic,
	partition,
	limits,
}: {
	deploymentEnvironment: string;
	topic: string;
	partition: number;
	limits: KafkaOwnedPartitionProducerLimits;
}): void => {
	assertNonEmpty({
		name: "deploymentEnvironment",
		value: deploymentEnvironment,
	});
	assertNonEmpty({ name: "topic", value: topic });
	if (!Number.isSafeInteger(partition) || partition < 0) {
		throw new RangeError(`Invalid Kafka partition: ${partition}`);
	}
	assertPositiveSafeInteger({
		name: "transactionTimeoutMs",
		value: limits.transactionTimeoutMs,
	});
	assertPositiveSafeInteger({ name: "retryCount", value: limits.retryCount });
	if (limits.retryCount > maximumKafkaProducerRetryCount) {
		throw new RangeError(
			`retryCount cannot exceed ${maximumKafkaProducerRetryCount}`,
		);
	}
	assertPositiveSafeInteger({
		name: "initialRetryTimeMs",
		value: limits.initialRetryTimeMs,
	});
	assertPositiveSafeInteger({
		name: "maxRetryTimeMs",
		value: limits.maxRetryTimeMs,
	});
	if (limits.initialRetryTimeMs > limits.maxRetryTimeMs) {
		throw new RangeError("initialRetryTimeMs cannot exceed maxRetryTimeMs");
	}
};

export const ownedPartitionTransactionalIdOf = ({
	deploymentEnvironment,
	topic,
	partition,
}: {
	deploymentEnvironment: string;
	topic: string;
	partition: number;
}): string =>
	[
		"autumn-balance-worker",
		encodeURIComponent(deploymentEnvironment),
		encodeURIComponent(topic),
		partition.toString(),
	].join(":");

export const createKafkaOwnedPartitionProducer = ({
	kafka,
	deploymentEnvironment,
	topic,
	partition,
	limits,
}: {
	kafka: KafkaProducerFactoryPort;
	deploymentEnvironment: string;
	topic: string;
	partition: number;
	limits: KafkaOwnedPartitionProducerLimits;
}): KafkaOwnedPartitionProducerPort => {
	validateProducerConfiguration({
		deploymentEnvironment,
		topic,
		partition,
		limits,
	});

	return kafka.producer({
		transactionalId: ownedPartitionTransactionalIdOf({
			deploymentEnvironment,
			topic,
			partition,
		}),
		idempotent: true,
		maxInFlightRequests: 1,
		transactionTimeout: limits.transactionTimeoutMs,
		retry: {
			retries: limits.retryCount,
			initialRetryTime: limits.initialRetryTimeMs,
			maxRetryTime: limits.maxRetryTimeMs,
		},
	});
};
