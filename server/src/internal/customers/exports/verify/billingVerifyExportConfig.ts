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
		replicaPoolMax: number;
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
	/** Verifications read through their own replica pool, sized past the
	 * concurrency so a verification never waits for a connection. At 16 the pool
	 * peaked at 10 server backends on a 3.1M-customer run. */
	customer: {
		concurrency: 16,
		replicaPoolMax: 20,
		timeoutMs: 30_000,
		attempts: 6,
		retryDelayMs: 2_000,
		maxRetryDelayMs: 30_000,
	},
	/** A memoized read is evicted only when its own deadline rejects it, so it
	 * must expire well inside the customer deadline — otherwise the customer
	 * attempt dies first and its retry re-attaches to the same stalled promise.
	 * Concurrency alone does not bound the request rate, so these reads are
	 * paced against the same Stripe limit the sweep uses. */
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
