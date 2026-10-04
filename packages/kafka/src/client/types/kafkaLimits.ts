export type KafkaProducerLimits = {
	transactionTimeoutMs: number;
	/** Idempotent sessions only: produces allowed on the wire at once; unset or 1 waits for each. */
	maxInFlightRequests?: number;
	retryCount: number;
	initialRetryTimeMs: number;
	maxRetryTimeMs: number;
};
export type KafkaIdempotentProducerLimits = Omit<
	KafkaProducerLimits,
	"transactionTimeoutMs"
>;
export type KafkaClientLimits = {
	connectionTimeoutMs: number;
	requestTimeoutMs: number;
	retryCount: number;
	initialRetryTimeMs: number;
	maxRetryTimeMs: number;
};
export type KafkaConsumerGroupTimings = {
	fetchMaxWaitTimeMs: number;
	heartbeatIntervalMs: number;
	rebalanceTimeoutMs: number;
	sessionTimeoutMs: number;
};
