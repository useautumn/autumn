import type { DbUsageAlertLike } from "../usageAlert.js";
import { usageLimitFilterKey } from "../usageLimit.js";

/** Two alerts are the same alert when every part of this tuple matches. */
export const usageAlertIdentity = (alert: DbUsageAlertLike): string =>
	[
		alert.feature_id ?? "",
		alert.basis ?? "balance",
		usageLimitFilterKey(alert.filter),
		alert.threshold_type,
		alert.threshold,
	].join("|");
