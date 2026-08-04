import { queue } from "@trigger.dev/sdk/v3";

export const CUSTOMER_EXPORT_PARENT_QUEUE_NAME = "customer-export-parent";

export const CUSTOMER_EXPORT_PARENT_CONCURRENCY = 2;

/** Retries restart or reconcile the upload; only the final attempt marks failure. */
export const CUSTOMER_EXPORT_PARENT_RETRY = { maxAttempts: 3 } as const;

export const CUSTOMER_EXPORT_MAX_DURATION_SECONDS = 86_400;

export const customerExportParentQueue = queue({
	name: CUSTOMER_EXPORT_PARENT_QUEUE_NAME,
	concurrencyLimit: CUSTOMER_EXPORT_PARENT_CONCURRENCY,
});

export const getCustomerExportTriggerOptions = ({
	isDev,
}: {
	isDev: boolean;
}) => (isDev && process.env.S3_REGION ? { region: process.env.S3_REGION } : {});
