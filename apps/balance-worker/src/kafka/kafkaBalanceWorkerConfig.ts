import type { ConsumerConfig, KafkaConfig } from "kafkajs";

export type KafkaBalanceWorkerClientLimits = {
	connectionTimeoutMs: number;
	requestTimeoutMs: number;
	retryCount: number;
	initialRetryTimeMs: number;
	maxRetryTimeMs: number;
};

type KafkaTransportConfig = Omit<
	KafkaConfig,
	| "brokers"
	| "clientId"
	| "connectionTimeout"
	| "requestTimeout"
	| "enforceRequestTimeout"
	| "retry"
>;

const maximumKafkaClientRetryCount = 10;

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

export const balanceWorkerKafkaConfigOf = ({
	clientId,
	brokers,
	transport,
	limits,
}: {
	clientId: string;
	brokers: string[];
	transport: KafkaTransportConfig;
	limits: KafkaBalanceWorkerClientLimits;
}): KafkaConfig => {
	if (clientId.trim().length === 0) throw new Error("clientId cannot be empty");
	if (
		brokers.length === 0 ||
		brokers.some((broker) => broker.trim().length === 0)
	) {
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
};

export const balanceWorkerConsumerConfigOf = ({
	groupId,
	fetchMaxWaitTimeMs,
}: {
	groupId: string;
	fetchMaxWaitTimeMs: number;
}): ConsumerConfig => {
	if (groupId.trim().length === 0) throw new Error("groupId cannot be empty");
	assertPositiveSafeInteger({
		name: "fetchMaxWaitTimeMs",
		value: fetchMaxWaitTimeMs,
	});
	return {
		groupId,
		readUncommitted: false,
		allowAutoTopicCreation: false,
		maxWaitTimeInMs: fetchMaxWaitTimeMs,
	};
};
