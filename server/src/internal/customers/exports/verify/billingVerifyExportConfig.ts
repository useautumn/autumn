export const BILLING_VERIFY_CONCURRENCY = 8;

export const STRIPE_LIST_PAGE_SIZE = 100;

/** Concurrent created-range windows. At ~2s per 100-subscription page this is
 * ~4 req/s against Stripe's 100 req/s live (25 req/s test) read limit. */
export const STRIPE_SWEEP_CONCURRENCY = 8;

export const STRIPE_SWEEP_WINDOW_MONTHS = 1;

export const MAX_MEMOIZED_STRIPE_READS = 2000;

/** A read that never settles is retried once on a fresh connection, then the
 * customer is written as a failed row. */
export const BILLING_VERIFY_CUSTOMER_TIMEOUT_MS = 120_000;

export const BILLING_VERIFY_CUSTOMER_ATTEMPTS = 2;

export const BILLING_VERIFY_RETRY_DELAY_MS = 5_000;
