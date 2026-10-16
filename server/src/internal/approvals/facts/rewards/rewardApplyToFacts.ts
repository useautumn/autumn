import type { FullCustomer } from "@autumn/shared";
import type { RewardApplyFacts } from "@autumn/shared/api/approvals/evaluate/index.js";

export const rewardApplyToFacts = ({
	fullCustomer,
	rewardId,
}: {
	fullCustomer: FullCustomer;
	rewardId: string;
}): RewardApplyFacts => ({ customer: fullCustomer, reward_id: rewardId });
