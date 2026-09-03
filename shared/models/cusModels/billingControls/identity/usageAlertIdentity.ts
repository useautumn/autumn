import {
	type DbUsageAlertLike,
	DEFAULT_USAGE_ALERT_BASIS,
} from "../usageAlert.js";
import { usageLimitFilterKey } from "../usageLimit.js";

export const usageAlertIdentity = (alert: DbUsageAlertLike): string =>
	[
		alert.feature_id ?? "",
		alert.basis ?? DEFAULT_USAGE_ALERT_BASIS,
		usageLimitFilterKey(alert.filter),
		alert.threshold_type,
		alert.threshold,
	].join("|");
