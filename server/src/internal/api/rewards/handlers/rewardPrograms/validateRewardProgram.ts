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

/** Free product rewards are deprecated; existing programs using them still run */
export const validateRewardTypeSupported = (reward: Reward) => {
	if (reward.type === RewardType.FreeProduct) {
		throw invalidRequest(
			"Free product rewards are deprecated for referral programs. Use a feature grant or discount reward instead.",
		);
	}
};

/** Checkout-triggered programs need products to match and a usable redemption cap */
export const validateRewardProgramTrigger = ({
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
