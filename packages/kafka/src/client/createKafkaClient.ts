import type { KafkaConfig } from "kafkajs";
import { assertPositiveSafeInteger } from "../lib/assert.js";
import type { KafkaTransportConfig } from "./types/kafkaClient.js";
import type { KafkaClientLimits } from "./types/kafkaLimits.js";

const maximumKafkaClientRetryCount = 10;

export function createKafkaClient({
	clientId,
	brokers,
	transport,
	limits,
}: {
	clientId: string;
	brokers: string[];
	transport: KafkaTransportConfig;
	limits: KafkaClientLimits;
}): KafkaConfig {
	if (clientId.trim().length === 0) throw new Error("clientId cannot be empty");
	if (!hasNonEmptyBrokers({ brokers })) {
		throw new Error("brokers must contain non-empty addresses");
	}
	assertPositiveSafeInteger({
		name: "connectionTimeoutMs",
		value: limits.connectionTimeoutMs,
	});
	assertPositiveSafeInteger({
		name: "requestTimeoutMs",
		value: limits.requestTimeoutMs,
	});
	assertPositiveSafeInteger({ name: "retryCount", value: limits.retryCount });
	if (limits.retryCount > maximumKafkaClientRetryCount) {
		throw new RangeError(
			`retryCount cannot exceed ${maximumKafkaClientRetryCount}`,
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

	return {
		clientId,
		brokers,
		...transport,
		connectionTimeout: limits.connectionTimeoutMs,
		requestTimeout: limits.requestTimeoutMs,
		enforceRequestTimeout: true,
		retry: {
			retries: limits.retryCount,
			initialRetryTime: limits.initialRetryTimeMs,
			maxRetryTime: limits.maxRetryTimeMs,
		},
	};
}

function hasNonEmptyBrokers({ brokers }: { brokers: string[] }): boolean {
	if (brokers.length === 0) return false;
	for (let index = 0; index < brokers.length; index++) {
		if (index in brokers && brokers[index].trim().length === 0) return false;
	}
	return true;
}
