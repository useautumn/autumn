import type { UsageLimitWebhookBlock } from "../../../api/webhooks/balances/usageLimitWebhookBlock.js";
import { USAGE_LIMIT_INTERVALS } from "../../../models/cusModels/billingControls/usageLimit.js";
import type { UsageWindowLimit } from "../../../models/cusProductModels/cusEntModels/usageWindowModels.js";
import { subtractSafe } from "../../common/mathUtils.js";
import { entIntvToResetIntv } from "../../productV2Utils/productItemUtils/convertProductItem/planItemIntervals.js";

type UsageLimitInterval = (typeof USAGE_LIMIT_INTERVALS)[number];

const isUsageLimitInterval = (
	interval: ReturnType<typeof entIntvToResetIntv>,
): interval is UsageLimitInterval =>
	(USAGE_LIMIT_INTERVALS as readonly unknown[]).includes(interval);

/** The cap as a webhook states it, with its live window; null for an interval the webhook has no name for. */
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
