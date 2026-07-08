import type { RewardMismatch } from "@autumn/shared";
import type Stripe from "stripe";

/** Evaluates that the subscription has exactly the expected reward coupon IDs. */
export const evaluateRewards = ({
	sub,
	rewards,
}: {
	sub: Stripe.Subscription;
	rewards: string[];
}): RewardMismatch | undefined => {
	const subCouponIds =
		sub.discounts?.map((discount) => {
			if (typeof discount === "string") return discount;
			const d = discount as Stripe.Discount;
			return d.source?.coupon
				? typeof d.source.coupon === "string"
					? d.source.coupon
					: d.source.coupon.id
				: undefined;
		}) ?? [];

	const missingRewardIds = rewards.filter(
		(reward) => !subCouponIds.includes(reward),
	);
	const unexpectedRewardIds = subCouponIds.filter(
		(id): id is string => !!id && !rewards.includes(id),
	);

	if (missingRewardIds.length === 0 && unexpectedRewardIds.length === 0) {
		return undefined;
	}

	return {
		type: "reward_mismatch",
		missing_reward_ids: missingRewardIds,
		unexpected_reward_ids: unexpectedRewardIds,
	};
};
