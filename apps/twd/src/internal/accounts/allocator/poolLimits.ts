/** Stripe budget: a key sustains 4 concurrent workers; also the most accounts twd creates per key. */
export const ACCOUNTS_PER_KEY_CAP = 4;
/** Safety ceiling on one run's workers; the real limit is usable keys × ACCOUNTS_PER_KEY_CAP. */
export const MAX_RUN_WORKERS = 5_000;
