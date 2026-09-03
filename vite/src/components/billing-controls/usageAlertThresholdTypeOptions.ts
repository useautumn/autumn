import type { DbUsageAlert } from "@autumn/shared";

type UsageAlertThresholdType = DbUsageAlert["threshold_type"];

export const USAGE_ALERT_THRESHOLD_TYPE_LABELS: Record<
	UsageAlertThresholdType,
	string
> = {
	usage: "Usage (absolute value)",
	usage_percentage: "Percentage used",
	remaining: "Remaining (absolute value)",
	remaining_percentage: "Percentage remaining",
};

export const USAGE_ALERT_THRESHOLD_TYPE_OPTIONS = Object.entries(
	USAGE_ALERT_THRESHOLD_TYPE_LABELS,
).map(([value, label]) => ({ value, label }));
