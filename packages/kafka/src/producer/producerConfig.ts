import type { ProducerConfig } from "kafkajs";
import type { KafkaProducerLimits } from "../client/types/kafkaLimits.js";
import { assertNonEmpty, assertPositiveSafeInteger } from "../lib/assert.js";
import type { KafkaProducerSessionConfig } from "./types/producer.js";

const maximumKafkaProducerRetryCount = 10;

export function partitionProducerTransactionalIdOf({
	prefix,
	deploymentEnvironment,
	topic,
	partition,
}: {
	prefix: string;
	deploymentEnvironment: string;
	topic: string;
	partition: number;
}): string {
	assertNonEmpty({ name: "prefix", value: prefix });
	assertNonEmpty({
		name: "deploymentEnvironment",
		value: deploymentEnvironment,
	});
	assertNonEmpty({ name: "topic", value: topic });
	if (!Number.isSafeInteger(partition) || partition < 0) {
		throw new RangeError(`Invalid Kafka partition: ${partition}`);
	}
	return [
		prefix,
		encodeURIComponent(deploymentEnvironment),
		encodeURIComponent(topic),
		partition.toString(),
	].join(":");
}

export function createProducerConfig({
	transactionalId,
	limits,
}: KafkaProducerSessionConfig): ProducerConfig {
	assertNonEmpty({ name: "transactionalId", value: transactionalId });
	validateProducerLimits({ limits });

	return {
		transactionalId,
		idempotent: true,
		maxInFlightRequests: 1,
		transactionTimeout: limits.transactionTimeoutMs,
		retry: {
			retries: limits.retryCount,
			initialRetryTime: limits.initialRetryTimeMs,
			maxRetryTime: limits.maxRetryTimeMs,
		},
	};
}

function validateProducerLimits({
	limits,
}: {
	limits: KafkaProducerLimits;
}): void {
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
}
