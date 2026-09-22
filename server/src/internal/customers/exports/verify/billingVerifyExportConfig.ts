type BillingVerifyExportConfig = {
	sweep: {
		pageSize: number;
		concurrency: number;
		windowMonths: number;
		pageTimeoutMs: number;
		pageAttempts: number;
		retryDelayMs: number;
	};
	customer: {
		concurrency: number;
		timeoutMs: number;
		attempts: number;
		retryDelayMs: number;
	};
	stripeReader: {
		maxMemoizedReads: number;
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
		windowMonths: 1,
		pageTimeoutMs: 60_000,
		pageAttempts: 3,
		retryDelayMs: 2_000,
	},
	customer: {
		concurrency: 8,
		timeoutMs: 120_000,
		attempts: 2,
		retryDelayMs: 5_000,
	},
	stripeReader: {
		maxMemoizedReads: 2000,
	},
};
