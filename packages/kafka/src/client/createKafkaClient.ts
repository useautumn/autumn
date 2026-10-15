import { assertPositiveSafeInteger } from "../lib/assert.js";
import type {
	KafkaClientConfig,
	KafkaLogSink,
	KafkaTransportConfig,
} from "./types/kafkaClient.js";
import type { KafkaClientLimits } from "./types/kafkaLimits.js";
import type { GroupProtocol } from "./types/kafkaWire.js";

const maximumKafkaClientRetryCount = 10;

export function createKafkaClient({
	clientId,
	brokers,
	transport,
	limits,
	logSink,
	groupProtocol,
}: {
	clientId: string;
	brokers: string[];
	transport: KafkaTransportConfig;
	limits: KafkaClientLimits;
	logSink?: KafkaLogSink;
	groupProtocol?: GroupProtocol;
}): KafkaClientConfig {
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
		...(logSink && { logSink }),
		...(groupProtocol && { groupProtocol }),
		connectionTimeout: limits.connectionTimeoutMs,
		requestTimeout: limits.requestTimeoutMs,
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
