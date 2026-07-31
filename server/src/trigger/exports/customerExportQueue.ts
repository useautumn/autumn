import { queue } from "@trigger.dev/sdk/v3";

export const CUSTOMER_EXPORT_PARENT_QUEUE_NAME = "customer-export-parent";

export const CUSTOMER_EXPORT_PARENT_CONCURRENCY = 2;

// A retried attempt restarts the export from scratch (or reconciles a finished
// upload); only the final attempt marks the row failed.
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
}) => (isDev ? { region: "eu-central-1" as const } : {});
