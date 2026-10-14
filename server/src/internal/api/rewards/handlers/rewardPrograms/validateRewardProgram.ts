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

export const validateRewardTypeSupported = (reward: Reward) => {
	if (reward.type === RewardType.FreeProduct) {
		throw invalidRequest(
			"Free product rewards are deprecated for referral programs. Use a feature grant or discount reward instead.",
		);
	}
};

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

	if (!maxRedemptions) {
		throw invalidRequest(
			"When `Redeem On` is set to `Checkout`, max redemptions must be greater than 0",
		);
	}
};
