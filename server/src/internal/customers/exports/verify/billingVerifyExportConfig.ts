// A page of live Stripe reads is slow, so small pages keep progress moving.
export const BILLING_VERIFY_EXPORT_PAGE_SIZE = 40;

export const BILLING_VERIFY_CONCURRENCY = 8;

export const STRIPE_LIST_PAGE_SIZE = 100;

export const TEST_CLOCK_SWEEP_CONCURRENCY = 4;

export const MAX_MEMOIZED_STRIPE_READS = 2000;

/** A read that never settles is retried once on a fresh connection, then the
 * customer is written as a failed row. */
export const BILLING_VERIFY_CUSTOMER_TIMEOUT_MS = 120_000;

export const BILLING_VERIFY_CUSTOMER_ATTEMPTS = 2;

export const BILLING_VERIFY_RETRY_DELAY_MS = 5_000;
