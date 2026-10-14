import type { UsageWindow } from "@autumn/shared";

export interface UsageWindowUpdate {
	internal_customer_id: string;
	feature_id: string;
	usage_windows: UsageWindow[];
}
