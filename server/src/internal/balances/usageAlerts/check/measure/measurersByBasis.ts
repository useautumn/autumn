import type { UsageAlertBasis } from "@autumn/shared";
import { measureBalanceAlert } from "./measureBalanceAlert.js";
import { measureUsageLimitAlert } from "./measureUsageLimitAlert.js";
import type { UsageAlertMeasurer } from "./types/usageAlertMeasurer.js";

export const measurersByBasis: Record<UsageAlertBasis, UsageAlertMeasurer> = {
	balance: measureBalanceAlert("balance"),
	included: measureBalanceAlert("included"),
	recurring: measureBalanceAlert("recurring"),
	usage_limit: measureUsageLimitAlert,
};
