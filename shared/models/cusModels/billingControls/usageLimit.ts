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

export const USAGE_LIMIT_FILTER_MAX_KEYS = 4;
export const USAGE_LIMIT_FILTER_MAX_KEY_LENGTH = 64;
export const USAGE_LIMIT_FILTER_MAX_VALUE_LENGTH = 128;

// Scalars only: values are canonicalized to strings so "29384" and 29384 are
// the same condition (counters are keyed by these canonical values).
const UsageLimitFilterValueSchema = z
	.union([
		z.string().min(1).max(USAGE_LIMIT_FILTER_MAX_VALUE_LENGTH),
		z.number(),
		z.boolean(),
	])
	.transform(String);

export const UsageLimitFilterSchema = z.object({
	properties: z
		.record(
			z.string().min(1).max(USAGE_LIMIT_FILTER_MAX_KEY_LENGTH),
			UsageLimitFilterValueSchema,
		)
		.meta({
			description:
				"Event property equality conditions. A usage event counts toward this cap only when every listed property matches (AND).",
		})
		.check((ctx) => {
			const keyCount = Object.keys(ctx.value).length;
			if (keyCount < 1 || keyCount > USAGE_LIMIT_FILTER_MAX_KEYS) {
				ctx.issues.push({
					code: "custom",
					message: `filter.properties must have between 1 and ${USAGE_LIMIT_FILTER_MAX_KEYS} keys`,
					input: ctx.value,
				});
			}
		}),
});

export type UsageLimitFilter = z.infer<typeof UsageLimitFilterSchema>;

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
	filter: UsageLimitFilterSchema.optional().meta({
		description:
			"When set, only usage from events whose properties match counts toward this cap. Omit to count all usage of the feature.",
	}),
});

export type DbUsageLimit = z.infer<typeof DbUsageLimitSchema>;

/**
 * Canonical identity of a filter: sorted `key=value` pairs. Counters and
 * dedup checks key off this, so config edits can never orphan a live counter.
 */
export const usageLimitFilterKey = (
	filter: UsageLimitFilter | null | undefined,
): string => {
	if (!filter?.properties) return "";
	return Object.entries(filter.properties)
		.map(([key, value]) => [key, String(value)] as const)
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([key, value]) => `${key}=${value}`)
		.join("&");
};

/**
 * Whether an event's properties satisfy a limit's filter: every condition
 * must match (AND), scalar values compare string-normalized. No filter
 * matches everything; a filter never matches an event without properties.
 */
export const usageLimitFilterMatchesProperties = ({
	filterProperties,
	eventProperties,
}: {
	filterProperties: Record<string, string> | null | undefined;
	eventProperties: Record<string, unknown> | null | undefined;
}): boolean => {
	if (!filterProperties) return true;
	if (!eventProperties) return false;
	return Object.entries(filterProperties).every(([key, value]) => {
		const eventValue = eventProperties[key];
		if (eventValue == null || typeof eventValue === "object") return false;
		return String(eventValue) === String(value);
	});
};

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
	// Legacy rows reach here as raw JSON without the schema's enabled:true default.
	const leftEnabled = left.enabled ?? true;
	const rightEnabled = right.enabled ?? true;
	if (leftEnabled !== rightEnabled) return leftEnabled ? left : right;
	if (left.interval === right.interval) {
		return right.limit < left.limit ? right : left;
	}
	return usageLimitPerDay(right) < usageLimitPerDay(left) ? right : left;
};
