export type KafkaProducerLimits = {
	transactionTimeoutMs: number;
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
