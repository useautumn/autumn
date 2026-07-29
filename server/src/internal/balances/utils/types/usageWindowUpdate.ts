import type { UsageWindow } from "@autumn/shared";

/** Usage-window rows to upsert into Postgres.
 * Empty arrays mean no Redis rows to flush; rolling/expiry lives elsewhere. */
export interface UsageWindowUpdate {
	internal_customer_id: string;
	feature_id: string;
	usage_windows: UsageWindow[];
}
