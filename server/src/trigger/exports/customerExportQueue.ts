import { queue } from "@trigger.dev/sdk/v3";

export const CUSTOMER_EXPORT_PARENT_QUEUE_NAME = "customer-export-parent";
export const CUSTOMER_EXPORT_WORKER_QUEUE_NAME = "customer-export-worker";

export const CUSTOMER_EXPORT_PARENT_CONCURRENCY = 2;
export const CUSTOMER_EXPORT_WORKER_CONCURRENCY = 10;

/** A retried worker redoes its whole range; re-uploading a part overwrites it. */
export const CUSTOMER_EXPORT_WORKER_RETRY = { maxAttempts: 3 } as const;
// Retries recover failures that leave the row queued (e.g. the initial DB
// read); any later failure lands the row in a non-queued state the rerun skips.
export const CUSTOMER_EXPORT_PARENT_RETRY = { maxAttempts: 3 } as const;

export const CUSTOMER_EXPORT_MAX_DURATION_SECONDS = 86_400;

export const customerExportParentQueue = queue({
	name: CUSTOMER_EXPORT_PARENT_QUEUE_NAME,
	concurrencyLimit: CUSTOMER_EXPORT_PARENT_CONCURRENCY,
});

export const customerExportWorkerQueue = queue({
	name: CUSTOMER_EXPORT_WORKER_QUEUE_NAME,
	concurrencyLimit: CUSTOMER_EXPORT_WORKER_CONCURRENCY,
});

export const getCustomerExportTriggerOptions = ({
	isDev,
}: {
	isDev: boolean;
}) => (isDev ? { region: "eu-central-1" as const } : {});
