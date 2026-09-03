import type { UsageWindow, UsageWindowLimit } from "@autumn/shared";
import { measureUsageWindowLimit } from "@/internal/balances/utils/usageWindows/measureUsageWindowLimit.js";
import type { UsageAlertMeasurement } from "../types/usageAlertMeasurement.js";

export const usageWindowLimitToUsageAlertMeasurement = ({
	limit,
	usageWindows,
	now,
}: {
	limit: UsageWindowLimit;
	usageWindows: UsageWindow[];
	now: number;
}): UsageAlertMeasurement | null => {
	const measured = measureUsageWindowLimit({ limit, usageWindows, now });
	if (!measured) return null;

	return {
		usage: measured.usage,
		denominator: limit.limit > 0 ? limit.limit : null,
		remaining: measured.block.remaining,
		periodStartAt: limit.window_start_at,
		payloadBlock: { basis: "usage_limit", usage_limit: measured.block },
	};
};
