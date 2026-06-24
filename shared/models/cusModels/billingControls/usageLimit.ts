import { z } from "zod/v4";
import { ResetInterval } from "../../productModels/intervals/resetInterval.js";

/**
 * A hard usage cap on one feature: at most `limit` units per `interval`.
 * Stored on the customer's `usage_limits` billing-control
 * column; an entry's presence arms the cap. Enforcement happens in the
 * deduction script against customer-scoped usage-window counters.
 */
/** Intervals supported for a usage-limit cap; kept in sync with the UI dropdown. */
export const USAGE_LIMIT_INTERVALS = [
	ResetInterval.Day,
	ResetInterval.Week,
	ResetInterval.Month,
	ResetInterval.Year,
] as const;

export const DbUsageLimitSchema = z.object({
	feature_id: z.string().meta({
		description: "The feature this usage limit applies to.",
	}),
	enabled: z.boolean().default(true).meta({
		description: "Whether this usage limit is enabled.",
	}),
	limit: z.number().min(0).meta({
		description: "Maximum units allowed per interval.",
	}),
	interval: z.enum(USAGE_LIMIT_INTERVALS).meta({
		description:
			"Interval for the cap, aligned to the customer's billing cycle.",
	}),
});

export type DbUsageLimit = z.infer<typeof DbUsageLimitSchema>;

const USAGE_LIMIT_INTERVAL_DAYS: Record<
	(typeof USAGE_LIMIT_INTERVALS)[number],
	number
> = {
	[ResetInterval.Day]: 1,
	[ResetInterval.Week]: 7,
	[ResetInterval.Month]: 30,
	[ResetInterval.Year]: 365,
};

// limit per day — comparable across intervals (100/day = 100, 2000/month ≈ 66.7).
const usageLimitPerDay = (usageLimit: DbUsageLimit) =>
	usageLimit.limit / USAGE_LIMIT_INTERVAL_DAYS[usageLimit.interval];

// Enabled beats disabled. Same interval: lower limit wins. Different intervals:
// lower per-day rate wins (the resolver enforces a single window per feature).
export const pickStricterUsageLimit = (
	left: DbUsageLimit,
	right: DbUsageLimit,
): DbUsageLimit => {
	if (left.enabled !== right.enabled) return left.enabled ? left : right;
	if (left.interval === right.interval) {
		return right.limit < left.limit ? right : left;
	}
	return usageLimitPerDay(right) < usageLimitPerDay(left) ? right : left;
};
