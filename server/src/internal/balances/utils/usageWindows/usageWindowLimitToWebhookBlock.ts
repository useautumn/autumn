import {
	entIntvToResetIntv,
	subtractSafe,
	USAGE_LIMIT_INTERVALS,
	type UsageLimitWebhookBlock,
	type UsageWindowLimit,
} from "@autumn/shared";

type UsageLimitInterval = (typeof USAGE_LIMIT_INTERVALS)[number];

const isUsageLimitInterval = (
	interval: ReturnType<typeof entIntvToResetIntv>,
): interval is UsageLimitInterval =>
	(USAGE_LIMIT_INTERVALS as readonly unknown[]).includes(interval);

export const usageWindowLimitToWebhookBlock = ({
	limit,
	usage,
}: {
	limit: UsageWindowLimit;
	usage: number;
}): UsageLimitWebhookBlock | null => {
	const interval = entIntvToResetIntv({ entInterval: limit.interval });
	if (!isUsageLimitInterval(interval)) return null;

	return {
		limit: limit.limit,
		interval,
		anchor: limit.anchor_mode,
		usage,
		remaining: Math.max(0, subtractSafe({ left: limit.limit, right: usage })),
		window_start_at: limit.window_start_at,
		window_end_at: limit.window_end_at,
	};
};
