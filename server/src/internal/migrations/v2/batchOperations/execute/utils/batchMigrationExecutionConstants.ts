/** Customers claimed + mutated + finalized per loop iteration. Max ~7280: the
 * claim binds ~9 params per row against Postgres' 65535 cap. */
export const BATCH_MIGRATION_PAGE_SIZE = 5000;

/** Timeout for each bounded page transaction (one candidate batch, or the
 * final marks). */
export const BATCH_MIGRATION_PAGE_STATEMENT_TIMEOUT_MS = 60_000;

/** Candidate rows read + mutated per batch TRANSACTION. Pages are sized in
 * CUSTOMERS, so a page's row count is unbounded (a customer can hold many
 * customer products); committing per cp.id-keyset batch keeps every
 * transaction, statement and JS buffer bounded no matter how row-heavy the
 * page is. */
export const BATCH_MIGRATION_CANDIDATE_ROW_BATCH = 10_000;

/** Refuse a page with more candidate rows than this — grinding through more
 * is never intended; fail loudly instead. */
export const BATCH_MIGRATION_MAX_CANDIDATE_ROWS_PER_PAGE = 1_000_000;

/** Runaway backstop: 2000 pages × 5000 customers = 10M per run. */
export const BATCH_MIGRATION_MAX_PAGES = 2000;

/** Pages per trigger chunk task invocation (~100k customers per task). */
export const BATCH_MIGRATION_PAGES_PER_CHUNK = 20;

/** Concurrent Redis full-customer cache invalidations during finalize. */
export const BATCH_MIGRATION_CACHE_BUST_CONCURRENCY = 20;

/** Pages whose post-commit side effects may be in flight at once. */
export const BATCH_MIGRATION_DEFERRED_INFLIGHT = 3;
