import type { Reward } from "@autumn/shared";
import type {
	ApprovalCustomerFacts,
	RewardRedeemFacts,
} from "@autumn/shared/api/approvals/evaluate/index.js";

/** Redeeming a promo code or adding a coupon, judged on the reward it applies. */
export const rewardRedeemToFacts = ({
	customer,
	reward,
}: {
	customer: ApprovalCustomerFacts;
	reward: Pick<Reward, "id">;
}): RewardRedeemFacts => ({ customer, reward_id: reward.id });
