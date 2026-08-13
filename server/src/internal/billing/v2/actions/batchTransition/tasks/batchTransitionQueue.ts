import { queue } from "@trigger.dev/sdk/v3";

export const BATCH_TRANSITION_QUEUE_NAME = "batch-transition";

/** A single migration converges one pool per customer, so an unqueued task would
 * claim the environment's whole base concurrency and starve the migration chunks
 * that spawned it. concurrencyKey still gives one run at a time per pool. */
export const BATCH_TRANSITION_QUEUE_CONCURRENCY = 10;

export const batchTransitionQueue = queue({
	name: BATCH_TRANSITION_QUEUE_NAME,
	concurrencyLimit: BATCH_TRANSITION_QUEUE_CONCURRENCY,
});
