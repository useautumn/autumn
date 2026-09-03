import type { DbUsageAlert, DbUsageAlertParams } from "./usageAlert.js";
import { usageLimitFilterKey, usageLimitIdentity } from "./usageLimit.js";

type UsageAlertLike = DbUsageAlert | DbUsageAlertParams;

/** Two alerts are the same alert when every part of this tuple matches. */
export const usageAlertIdentity = (alert: UsageAlertLike): string =>
	[
		alert.feature_id ?? "",
		alert.basis ?? "balance",
		usageLimitFilterKey(alert.filter),
		alert.threshold_type,
		alert.threshold,
	].join("|");

export const isUsageLimitBasisAlert = (alert: UsageAlertLike): boolean =>
	alert.basis === "usage_limit";

/** Identity of the usage limit a usage_limit alert measures against. */
export const usageAlertTargetLimitIdentity = (alert: UsageAlertLike): string =>
	usageLimitIdentity({
		feature_id: alert.feature_id ?? "",
		filter: alert.filter,
	});
