/** Hard kill-switch for the lazy migration path (API, request-path enqueue,
 * and the per-customer lazy task). Flip to re-enable. */
export const LAZY_MIGRATION_RUNS_DISABLED = true;

export const MIGRATION_RUN_CUSTOMER_CONCURRENCY =
	Number(process.env.MIGRATION_RUN_CUSTOMER_CONCURRENCY) || 50;
/** An in-flight customer can hold two connections (its transaction plus a standalone read/write). */
export const MIGRATION_DB_POOL_MAX =
	Number(process.env.MIGRATION_DB_POOL_MAX) ||
	MIGRATION_RUN_CUSTOMER_CONCURRENCY * 2;
/** Client-side per-statement deadline. Never a pool statement_timeout: PgBouncer rejects that startup parameter (08P01). */
export const MIGRATION_DB_QUERY_DEADLINE_MS = 75_000;
/** Customers per chunk: one filtered keyset page, migrated by one chunk task. */
export const MIGRATION_CHUNK_SIZE = 500;
/** Chunks of one run in flight at once. */
export const MIGRATION_CHUNK_CONCURRENCY =
	Number(process.env.MIGRATION_CHUNK_CONCURRENCY) || 3;
export const MIGRATION_FILTER_PAGE_TRANSIENT_DB_ATTEMPTS = 5;
export const MIGRATION_FILTER_PAGE_TRANSIENT_DB_RETRY_DELAY_MS = 1_000;
export const MIGRATION_ITEM_SETTLE_DB_ATTEMPTS = 5;
export const MIGRATION_ITEM_SETTLE_DB_RETRY_DELAY_MS = 1_000;
