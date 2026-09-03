export const MAX_DISTINCT_ENTITLEMENTS = 100;
export const MAX_DISTINCT_BASE_PRICES = 100;

export const BATCH_TRANSITION_ROW_BATCH_SIZE = 5_000;
export const BATCH_TRANSITION_OPERATION_CONCURRENCY = 3;
export const MAX_BATCH_TRANSITION_ASSIGNMENTS = 100_000;
export const MAX_BATCH_TRANSITION_ROWS_PER_OPERATION = 100_000;
export const MAX_BATCH_TRANSITION_BATCHES = Math.ceil(
	MAX_BATCH_TRANSITION_ROWS_PER_OPERATION / BATCH_TRANSITION_ROW_BATCH_SIZE,
);
export const BATCH_TRANSITION_STATEMENT_TIMEOUT_MS = 30_000;

/** Customers below this entity count get their batch transition awaited in the
 * request instead of queued, so upgrades converge before the API responds. */
export const SYNC_BATCH_TRANSITION_MAX_ENTITIES = 1_000;
