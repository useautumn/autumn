import type { NormalizedFullSubject } from "@autumn/shared";
import type { FeatureBalanceResult } from "./getCachedFeatureBalances.js";

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
