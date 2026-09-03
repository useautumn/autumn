import type { ConsumerConfig, KafkaConfig } from "kafkajs";

export type KafkaBalanceWorkerClientLimits = {
	connectionTimeoutMs: number;
	requestTimeoutMs: number;
	retryCount: number;
	initialRetryTimeMs: number;
	maxRetryTimeMs: number;
};

export type KafkaBalanceWorkerTimings = {
	fetchMaxWaitTimeMs: number;
	heartbeatIntervalMs: number;
	recoveryDrainTimeoutMs: number;
	rebalanceTimeoutMs: number;
	sessionTimeoutMs: number;
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

export const assertKafkaBalanceWorkerTimings = ({
	timings,
}: {
	timings: KafkaBalanceWorkerTimings;
}): void => {
	assertPositiveSafeInteger({
		name: "fetchMaxWaitTimeMs",
		value: timings.fetchMaxWaitTimeMs,
	});
	assertPositiveSafeInteger({
		name: "heartbeatIntervalMs",
		value: timings.heartbeatIntervalMs,
	});
	assertPositiveSafeInteger({
		name: "recoveryDrainTimeoutMs",
		value: timings.recoveryDrainTimeoutMs,
	});
	assertPositiveSafeInteger({
		name: "rebalanceTimeoutMs",
		value: timings.rebalanceTimeoutMs,
	});
	assertPositiveSafeInteger({
		name: "sessionTimeoutMs",
		value: timings.sessionTimeoutMs,
	});
	if (timings.heartbeatIntervalMs >= timings.sessionTimeoutMs) {
		throw new RangeError(
			"heartbeatIntervalMs must be lower than sessionTimeoutMs",
		);
	}
	if (timings.sessionTimeoutMs > timings.rebalanceTimeoutMs) {
		throw new RangeError("sessionTimeoutMs cannot exceed rebalanceTimeoutMs");
	}
	const recoveryDrainHeadroomMs =
		timings.rebalanceTimeoutMs - timings.recoveryDrainTimeoutMs;
	if (recoveryDrainHeadroomMs < timings.heartbeatIntervalMs) {
		throw new RangeError(
			"recoveryDrainTimeoutMs must leave at least one heartbeatIntervalMs before rebalanceTimeoutMs",
		);
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
	timings,
}: {
	groupId: string;
	timings: KafkaBalanceWorkerTimings;
}): ConsumerConfig => {
	if (groupId.trim().length === 0) throw new Error("groupId cannot be empty");
	assertKafkaBalanceWorkerTimings({ timings });
	return {
		groupId,
		readUncommitted: false,
		allowAutoTopicCreation: false,
		maxWaitTimeInMs: timings.fetchMaxWaitTimeMs,
		heartbeatInterval: timings.heartbeatIntervalMs,
		rebalanceTimeout: timings.rebalanceTimeoutMs,
		sessionTimeout: timings.sessionTimeoutMs,
	};
};
