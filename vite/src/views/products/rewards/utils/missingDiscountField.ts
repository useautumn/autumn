import { CouponDurationType } from "@autumn/shared";
import type { FrontendReward } from "../types/frontendReward";

/**
 * Amount and Duration render an empty input with a placeholder when they hold
 * 0, so a blank field looks filled. Name the field rather than letting Stripe
 * reject the value.
 */
export const missingDiscountField = ({
	reward,
}: {
	reward: FrontendReward;
}): string | null => {
	if (reward.rewardCategory !== "discount") return null;

	const config = reward.discount_config;
	if (!config?.discount_value) return "Enter a discount amount";

	if (
		config.duration_type === CouponDurationType.Months &&
		!config.duration_value
	) {
		return "Enter how many months the discount lasts";
	}

	return null;
};
