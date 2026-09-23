type BillingVerifyExportConfig = {
	sweep: {
		pageSize: number;
		concurrency: number;
		windowDays: number;
		pageTimeoutMs: number;
		pageAttempts: number;
		retryDelayMs: number;
		maxRetryDelayMs: number;
		requestsPerSecond: number;
		sandboxRequestsPerSecond: number;
	};
	customer: {
		concurrency: number;
		timeoutMs: number;
		attempts: number;
		retryDelayMs: number;
		maxRetryDelayMs: number;
	};
	stripeReader: {
		maxMemoizedReads: number;
		timeoutMs: number;
		attempts: number;
		requestsPerSecond: number;
	};
};

/** Callers override only what a test needs to vary. */
export type SweepLimits = Partial<BillingVerifyExportConfig["sweep"]>;

export type CustomerLimits = Partial<BillingVerifyExportConfig["customer"]>;

/** A read that never settles is retried before the work it belongs to fails:
 * the Stripe SDK leaves an interrupted response body pending forever, so every
 * bounded read here needs its own deadline. */
export const billingVerifyExportConfig: BillingVerifyExportConfig = {
	sweep: {
		pageSize: 100,
		concurrency: 8,
		windowDays: 7,
		pageTimeoutMs: 60_000,
		pageAttempts: 3,
		retryDelayMs: 2_000,
		maxRetryDelayMs: 20_000,
		requestsPerSecond: 25,
		sandboxRequestsPerSecond: 5,
	},
	/** Each verification needs a replica connection, so throughput plateaus at
	 * roughly twice REPLICA_DB_POOL_MAX; past that the slots only queue.
	 * Measured on prod: 68ms/customer at 8, 48ms at 16, 47ms at 24. */
	customer: {
		concurrency: 16,
		timeoutMs: 30_000,
		attempts: 6,
		retryDelayMs: 2_000,
		maxRetryDelayMs: 30_000,
	},
	/** A memoized read is shared, so it must expire well inside the customer
	 * deadline; concurrency alone does not bound the request rate, so these
	 * reads are paced against the same Stripe limit the sweep uses. */
	stripeReader: {
		maxMemoizedReads: 2000,
		timeoutMs: 30_000,
		attempts: 1,
		requestsPerSecond: 40,
	},
};
