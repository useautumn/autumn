import type { DbUsageAlert } from "@autumn/shared";
import { Decimal } from "decimal.js";
import type { UsageAlertMeasurement } from "./types/usageAlertMeasurement.js";

const percentOf = ({
	part,
	denominator,
}: {
	part: number;
	denominator: number;
}) => new Decimal(part).div(denominator).mul(100).toNumber();

/** Pure crossing check over one measurement pair; the basis has already been resolved away. */
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
		const beforePercent = percentOf({ part: before.usage, denominator: before.denominator });
		const afterPercent = percentOf({ part: after.usage, denominator: after.denominator });
		return beforePercent < threshold && afterPercent >= threshold;
	}
	if (thresholdType === "remaining_percentage") {
		const beforePercent = percentOf({ part: before.remaining, denominator: before.denominator });
		const afterPercent = percentOf({ part: after.remaining, denominator: after.denominator });
		return afterPercent <= threshold && beforePercent > threshold;
	}
	return false;
};
