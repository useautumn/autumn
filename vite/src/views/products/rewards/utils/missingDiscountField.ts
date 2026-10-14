import { CouponDurationType } from "@autumn/shared";
import type { FrontendReward } from "../types/frontendReward";

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
