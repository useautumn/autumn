import type { DbUsageAlertLike } from "../usageAlert.js";
import { usageLimitIdentity } from "../usageLimit.js";

/** Identity of the usage limit a usage_limit alert measures against. */
export const usageAlertTargetLimitIdentity = (
	alert: DbUsageAlertLike,
): string =>
	usageLimitIdentity({
		feature_id: alert.feature_id ?? "",
		filter: alert.filter,
	});
