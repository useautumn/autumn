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
	/** A dead pooled connection fails the retry too if it comes back before the
	 * pool reaps it, and one customer's exhausted attempts restart the whole
	 * export — so back off far enough to outlast that. */
	customer: {
		concurrency: 8,
		timeoutMs: 120_000,
		attempts: 4,
		retryDelayMs: 2_000,
		maxRetryDelayMs: 30_000,
	},
	/** A memoized read is shared, so it must expire well inside the customer
	 * deadline — otherwise a retry re-attaches to the same stalled promise. */
	stripeReader: {
		maxMemoizedReads: 2000,
		timeoutMs: 30_000,
		attempts: 1,
	},
};
