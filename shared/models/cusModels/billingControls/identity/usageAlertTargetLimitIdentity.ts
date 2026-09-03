import type { DbUsageAlertLike } from "../usageAlert.js";
import { usageLimitIdentity } from "../usageLimit.js";

export const usageAlertTargetLimitIdentity = (
	alert: DbUsageAlertLike,
): string =>
	usageLimitIdentity({
		feature_id: alert.feature_id ?? "",
		filter: alert.filter,
	});
