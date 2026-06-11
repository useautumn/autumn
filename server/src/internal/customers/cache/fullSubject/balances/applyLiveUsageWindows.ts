import type { NormalizedFullSubject } from "@autumn/shared";
import type { FeatureBalanceResult } from "./getCachedFeatureBalances.js";

/**
 * Fill `normalized.usage_windows` from the live `_usage_windows` hash fields
 * returned by the batch balance read. The cached subject view never carries
 * counter rows (they'd be instantly stale), so this is the only hydration
 * source on the cache-hit path.
 */
export const applyLiveUsageWindows = ({
	normalized,
	featureBalances,
}: {
	normalized: NormalizedFullSubject;
	featureBalances: FeatureBalanceResult[];
}): void => {
	normalized.usage_windows = featureBalances.flatMap(
		(featureBalance) => featureBalance.usageWindows ?? [],
	);
};
