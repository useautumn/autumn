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
	orphans: {
		concurrency: number;
		lookupBatchSize: number;
		rowBatchSize: number;
		timeoutMs: number;
		attempts: number;
		retryDelayMs: number;
		maxRetryDelayMs: number;
		requestsPerSecond: number;
		sandboxRequestsPerSecond: number;
	};
};

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
	customer: {
		concurrency: 16,
		timeoutMs: 30_000,
		attempts: 6,
		retryDelayMs: 2_000,
		maxRetryDelayMs: 30_000,
	},
	stripeReader: {
		maxMemoizedReads: 2000,
		timeoutMs: 10_000,
		attempts: 1,
		requestsPerSecond: 40,
	},
	orphans: {
		concurrency: 8,
		lookupBatchSize: 1000,
		rowBatchSize: 100,
		timeoutMs: 10_000,
		attempts: 3,
		retryDelayMs: 2_000,
		maxRetryDelayMs: 20_000,
		requestsPerSecond: 25,
		sandboxRequestsPerSecond: 5,
	},
};
