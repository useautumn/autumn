/** Stripe budget: a key sustains 4 concurrent workers; also the most accounts twd creates per key. */
export const ACCOUNTS_PER_KEY_CAP = 4;
/** Upper bound on one run's workers, whatever the pool size. */
export const MAX_RUN_WORKERS = 400;
