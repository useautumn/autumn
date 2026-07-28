/** Customers claimed + mutated + finalized per loop iteration. */
export const BATCH_MIGRATION_PAGE_SIZE = 5000;

/** Timeout for the per-page mutation transaction (all patches' ops + marks). */
export const BATCH_MIGRATION_PAGE_STATEMENT_TIMEOUT_MS = 60_000;

/** Runaway backstop: 2000 pages × 5000 customers = 10M per run. */
export const BATCH_MIGRATION_MAX_PAGES = 2000;

/** Pages per trigger chunk task invocation (~100k customers per task). */
export const BATCH_MIGRATION_PAGES_PER_CHUNK = 20;

/** Concurrent Redis full-customer cache invalidations during finalize. */
export const BATCH_MIGRATION_CACHE_BUST_CONCURRENCY = 20;
