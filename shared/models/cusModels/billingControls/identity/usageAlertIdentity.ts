import type { DbUsageAlertLike } from "../usageAlert.js";
import { usageLimitFilterKey } from "../usageLimit.js";

export const usageAlertIdentity = (alert: DbUsageAlertLike): string =>
	[
		alert.feature_id ?? "",
		alert.basis ?? "balance",
		usageLimitFilterKey(alert.filter),
		alert.threshold_type,
		alert.threshold,
	].join("|");
