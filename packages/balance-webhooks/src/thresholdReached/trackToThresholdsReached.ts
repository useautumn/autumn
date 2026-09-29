import type { MutationEffect, TrackResult } from "@autumn/balance-engine";
import { effectsToThresholdsReached } from "./effectsToThresholdsReached.js";
import type { FundingBalance } from "./types/fundingBalance.js";
import type { ThresholdReached } from "./types/thresholdReached.js";
import { wasAllowanceUsed } from "./wasAllowanceUsed.js";

/** Every threshold one worker track crossed: the limits it reached, or else the allowance it used up. */
export const trackToThresholdsReached = ({
	effects,
	result,
	fundingBalance,
}: {
	effects: MutationEffect[];
	result: TrackResult;
	fundingBalance: FundingBalance;
}): ThresholdReached[] => {
	const limitsReached = effectsToThresholdsReached({ effects });
	// A limit reached on the funding feature already says more than its allowance running out.
	const fundingLimitReached = limitsReached.some(
		({ featureId }) => featureId === result.fundingFeatureId,
	);
	if (fundingLimitReached || !wasAllowanceUsed({ result, fundingBalance }))
		return limitsReached;
	return [
		...limitsReached,
		{ featureId: result.fundingFeatureId, type: "allowance_used" },
	];
};
