import type { DbUsageAlert, DbUsageAlertParams } from "./usageAlert.js";
import { usageLimitFilterKey } from "./usageLimit.js";

/** Two alerts are the same alert when every part of this tuple matches. */
export const usageAlertIdentity = (
	alert: DbUsageAlert | DbUsageAlertParams,
): string =>
	[
		alert.feature_id ?? "",
		alert.basis ?? "balance",
		usageLimitFilterKey(alert.filter),
		alert.threshold_type,
		alert.threshold,
	].join("|");

export const isUsageLimitBasisAlert = (
	alert: DbUsageAlert | DbUsageAlertParams,
): boolean => alert.basis === "usage_limit";
