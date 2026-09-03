import {
	EntInterval,
	ResetInterval,
	USAGE_LIMIT_INTERVALS,
	type UsageLimitWebhookBlock,
	type UsageWindowLimit,
} from "@autumn/shared";

type UsageLimitInterval = (typeof USAGE_LIMIT_INTERVALS)[number];

const WINDOW_INTERVAL_TO_LIMIT_INTERVAL: Partial<
	Record<EntInterval, UsageLimitInterval>
> = {
	[EntInterval.Day]: ResetInterval.Day,
	[EntInterval.Week]: ResetInterval.Week,
	[EntInterval.Month]: ResetInterval.Month,
	[EntInterval.Year]: ResetInterval.Year,
};

/** The webhook's view of a resolved cap at a given usage; null for intervals a cap cannot have. */
export const usageWindowLimitToWebhookBlock = ({
	limit,
	usage,
}: {
	limit: UsageWindowLimit;
	usage: number;
}): UsageLimitWebhookBlock | null => {
	const interval = WINDOW_INTERVAL_TO_LIMIT_INTERVAL[limit.interval];
	if (!interval) return null;

	return {
		limit: limit.limit,
		interval,
		anchor: limit.anchor_mode,
		usage,
		remaining: Math.max(0, limit.limit - usage),
		window_start_at: limit.window_start_at,
		window_end_at: limit.window_end_at,
	};
};
