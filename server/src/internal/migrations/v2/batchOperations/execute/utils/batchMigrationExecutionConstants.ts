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

/** Distinct live entitlement definitions for one feature on one page. One
 * unique id per customer is the pathological ceiling; over this, refuse. */
export const BATCH_MIGRATION_MAX_DISTINCT_ENTITLEMENTS = 5_000;

/** Runaway backstop: 2000 pages × 5000 customers = 10M per run. */
export const BATCH_MIGRATION_MAX_PAGES = 2000;

/** Pages per trigger chunk task invocation (~100k customers per task). */
export const BATCH_MIGRATION_PAGES_PER_CHUNK = 20;

/** Concurrent feature ops within one op type (removes, replaces, adds).
 * Different features touch disjoint customer_entitlements rows.
 * Env-overridable so a run can be ramped (or dropped to 1) without a deploy. */
export const BATCH_MIGRATION_FEATURE_OP_CONCURRENCY = Number(
	process.env.BATCH_MIGRATION_FEATURE_OP_CONCURRENCY ?? 3,
);

/** Concurrent applyReplacePatches groups (distinct grant deltas) on one page. */
export const BATCH_MIGRATION_PATCH_GROUP_CONCURRENCY = Number(
	process.env.BATCH_MIGRATION_PATCH_GROUP_CONCURRENCY ?? 50,
);

/** Concurrent Redis full-customer cache invalidations during finalize. */
export const BATCH_MIGRATION_CACHE_BUST_CONCURRENCY = 20;

/** Pages whose post-commit side effects may be in flight at once. */
export const BATCH_MIGRATION_DEFERRED_INFLIGHT = 3;

/** Ceiling for one page's deferred side effect (cache invalidation or item
 * events); a hung call otherwise parks settle/drain until trigger kills the chunk. */
export const BATCH_MIGRATION_DEFERRED_OPERATION_TIMEOUT_MS = 5 * 60_000;

/** Budget for one page across its transient-retry attempts. Pages run in
 * ~15s; anything past this is a stall, not a big page. */
export const BATCH_MIGRATION_PAGE_TIMEOUT_MS = 5 * 60_000;

/** How often a chunk with no page progress logs where it is stuck. */
export const BATCH_MIGRATION_STALL_LOG_INTERVAL_MS = 30_000;

/** Kept free at the end of a chunk's deadline: one deferred-op drain, one
 * bounded checkpoint write, and slack for logging and the return. */
export const BATCH_MIGRATION_CHUNK_FINALIZE_RESERVE_MS =
	BATCH_MIGRATION_DEFERRED_OPERATION_TIMEOUT_MS +
	BATCH_MIGRATION_PAGE_STATEMENT_TIMEOUT_MS +
	30_000;

/** Below this much remaining budget a chunk yields `slice_complete` instead
 * of starting a page that could only stall. */
export const BATCH_MIGRATION_MIN_PAGE_BUDGET_MS = 60_000;

/** Claim+execute+finalize attempts per page when Postgres drops or times out. */
export const BATCH_MIGRATION_TRANSIENT_DB_PAGE_ATTEMPTS = 5;

/** Pause between those page attempts. */
export const BATCH_MIGRATION_TRANSIENT_DB_RETRY_DELAY_MS = 1_000;
