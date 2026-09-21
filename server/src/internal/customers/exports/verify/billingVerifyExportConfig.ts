/** Below this many customers, reading each one live costs fewer Stripe calls
 * than listing the whole org. */
export const SWEEP_MIN_CUSTOMER_COUNT = 500;

// A page of live Stripe reads is slow, so small pages keep progress moving.
export const BILLING_VERIFY_EXPORT_PAGE_SIZE = 40;

export const BILLING_VERIFY_CONCURRENCY = 8;

export const STRIPE_LIST_PAGE_SIZE = 100;

export const TEST_CLOCK_SWEEP_CONCURRENCY = 4;

export const MAX_MEMOIZED_STRIPE_READS = 2000;
