import { queue } from "@trigger.dev/sdk/v3";

export const BATCH_TRANSITION_QUEUE_NAME = "batch-transition";

export const BATCH_TRANSITION_QUEUE_CONCURRENCY = 10;

export const batchTransitionQueue = queue({
	name: BATCH_TRANSITION_QUEUE_NAME,
	concurrencyLimit: BATCH_TRANSITION_QUEUE_CONCURRENCY,
});
