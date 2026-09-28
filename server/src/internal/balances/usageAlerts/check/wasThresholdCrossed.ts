import { type DbUsageAlert, percentageOf } from "@autumn/shared";
import type { UsageAlertMeasurement } from "./types/usageAlertMeasurement.js";

export const wasThresholdCrossed = ({
	alert,
	before,
	after,
}: {
	alert: Pick<DbUsageAlert, "threshold" | "threshold_type">;
	before: UsageAlertMeasurement;
	after: UsageAlertMeasurement;
}): boolean => {
	const { threshold, threshold_type: thresholdType } = alert;

	if (thresholdType === "usage") {
		return before.usage < threshold && after.usage >= threshold;
	}
	if (thresholdType === "remaining") {
		return after.remaining <= threshold && before.remaining > threshold;
	}

	if (before.denominator === null || after.denominator === null) return false;

	if (thresholdType === "usage_percentage") {
		const beforePercent = percentageOf({
			part: before.usage,
			whole: before.denominator,
		});
		const afterPercent = percentageOf({
			part: after.usage,
			whole: after.denominator,
		});
		return beforePercent < threshold && afterPercent >= threshold;
	}
	if (thresholdType === "remaining_percentage") {
		const beforePercent = percentageOf({
			part: before.remaining,
			whole: before.denominator,
		});
		const afterPercent = percentageOf({
			part: after.remaining,
			whole: after.denominator,
		});
		return afterPercent <= threshold && beforePercent > threshold;
	}
	return false;
};
