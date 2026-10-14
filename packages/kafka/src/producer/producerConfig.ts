import {
	type ICustomPartitioner,
	type PartitionerArgs,
	Partitioners,
	type ProducerConfig,
} from "kafkajs";
import type { KafkaIdempotentProducerLimits } from "../client/types/kafkaLimits.js";
import { assertNonEmpty, assertPositiveSafeInteger } from "../lib/assert.js";
import type { KafkaProducerSessionConfig } from "./types/producer.js";

const maximumKafkaProducerRetryCount = 10;

export function explicitPartitioner(): ReturnType<ICustomPartitioner> {
	const fallback = Partitioners.DefaultPartitioner();
	function partitionOf(args: PartitionerArgs): number {
		return args.message.partition ?? fallback(args);
	}
	return partitionOf;
}

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
	mode = "transactional",
}: KafkaProducerSessionConfig): ProducerConfig {
	if (mode === "idempotent") {
		return {
			...createIdempotentProducerConfig({ limits }),
			createPartitioner: explicitPartitioner,
		};
	}
	assertNonEmpty({ name: "transactionalId", value: transactionalId });
	assertPositiveSafeInteger({
		name: "transactionTimeoutMs",
		value: limits.transactionTimeoutMs,
	});
	validateRetryLimits({ limits });

	return {
		transactionalId,
		idempotent: true,
		maxInFlightRequests: 1,
		createPartitioner: explicitPartitioner,
		transactionTimeout: limits.transactionTimeoutMs,
		retry: {
			retries: limits.retryCount,
			initialRetryTime: limits.initialRetryTimeMs,
			maxRetryTime: limits.maxRetryTimeMs,
		},
	};
}

export function createIdempotentProducerConfig({
	limits,
}: {
	limits: KafkaIdempotentProducerLimits;
}): ProducerConfig {
	validateRetryLimits({ limits });

	return {
		idempotent: true,
		maxInFlightRequests: 1,
		retry: {
			retries: limits.retryCount,
			initialRetryTime: limits.initialRetryTimeMs,
			maxRetryTime: limits.maxRetryTimeMs,
		},
	};
}

function validateRetryLimits({
	limits,
}: {
	limits: KafkaIdempotentProducerLimits;
}): void {
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
