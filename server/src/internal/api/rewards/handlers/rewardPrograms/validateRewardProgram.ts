import {
	ErrCode,
	nullish,
	RecaseError,
	type Reward,
	RewardTriggerEvent,
	RewardType,
} from "@autumn/shared";

const invalidRequest = (message: string) =>
	new RecaseError({ message, code: ErrCode.InvalidRequest, statusCode: 400 });

/** Free product and discount rewards remain supported for existing programs only */
export const validateRewardIsFeatureGrant = (reward: Reward) => {
	if (reward.type !== RewardType.FeatureGrant) {
		throw invalidRequest(
			"Referral programs must be linked to a feature grant reward. Existing programs using other reward types continue to work.",
		);
	}
};

export const validateTriggerConfig = ({
	when,
	productIds,
	maxRedemptions,
}: {
	when: RewardTriggerEvent;
	productIds?: string[] | null;
	maxRedemptions?: number | null;
}) => {
	if (when !== RewardTriggerEvent.Checkout) return;

	if (nullish(productIds) || productIds!.length === 0) {
		throw invalidRequest(
			"When `Redeem On` is set to `Checkout`, must specify at least one product",
		);
	}

	// Checkout grants are skipped when redemption count >= max, so 0 blocks every grant
	if (!maxRedemptions) {
		throw invalidRequest(
			"When `Redeem On` is set to `Checkout`, max redemptions must be greater than 0",
		);
	}
};
