import { queue } from "@trigger.dev/sdk/v3";

export const CUSTOMER_EXPORT_PARENT_QUEUE_NAME = "customer-export-parent";
export const CUSTOMER_EXPORT_WORKER_QUEUE_NAME = "customer-export-worker";

export const CUSTOMER_EXPORT_PARENT_CONCURRENCY = 2;
export const CUSTOMER_EXPORT_WORKER_CONCURRENCY = 10;

/** A retried worker redoes its whole range; re-uploading a part overwrites it. */
export const CUSTOMER_EXPORT_WORKER_RETRY = { maxAttempts: 3 } as const;
// The parent aborts the upload and marks the job failed, so a retry would only
// re-run against an already-terminal export row.
export const CUSTOMER_EXPORT_PARENT_RETRY = { maxAttempts: 1 } as const;

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
