import type { MutationEffect, TrackResult } from "@autumn/balance-engine";
import { effectsToThresholdsReached } from "./effectsToThresholdsReached.js";
import type { FundingBalance } from "./types/fundingBalance.js";
import type { ThresholdReached } from "./types/thresholdReached.js";
import { wasAllowanceUsed } from "./wasAllowanceUsed.js";

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
