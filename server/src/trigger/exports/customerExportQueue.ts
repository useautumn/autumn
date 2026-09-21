import { CustomerExportKind } from "@autumn/shared";
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

/** The verify export holds the org's swept Stripe subscriptions in memory. */
export const getCustomerExportTriggerOptions = ({
	isDev,
	kind,
}: {
	isDev: boolean;
	kind: CustomerExportKind;
}) => ({
	...(isDev && process.env.S3_REGION ? { region: process.env.S3_REGION } : {}),
	...(kind === CustomerExportKind.BillingVerify
		? { machine: "large-1x" as const }
		: {}),
});
