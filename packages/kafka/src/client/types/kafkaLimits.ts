export type KafkaProducerLimits = {
	transactionTimeoutMs: number;
	/** Idempotent sessions only: produces allowed on the wire at once (1 = stop-and-wait). */
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
