import {
	type CreateRewardProgram,
	RewardReceivedBy,
	RewardTriggerEvent,
} from "@autumn/shared";

const onCheckoutReferrer = ({
	id = "checkout-referrer",
	rewardId,
	productIds,
	maxRedemptions = 2,
}: {
	id?: string;
	rewardId: string;
	productIds: string[];
	maxRedemptions?: number;
}): CreateRewardProgram => ({
	id,
	when: RewardTriggerEvent.Checkout,
	product_ids: productIds,
	internal_reward_id: rewardId,
	max_redemptions: maxRedemptions,
	received_by: RewardReceivedBy.Referrer,
});

const onCheckoutBoth = ({
	id = "checkout-both",
	rewardId,
	productIds,
	maxRedemptions = 2,
}: {
	id?: string;
	rewardId: string;
	productIds: string[];
	maxRedemptions?: number;
}): CreateRewardProgram => ({
	id,
	when: RewardTriggerEvent.Checkout,
	product_ids: productIds,
	internal_reward_id: rewardId,
	max_redemptions: maxRedemptions,
	received_by: RewardReceivedBy.All,
});

const onCustomerCreationReferrer = ({
	id = "immediate-referrer",
	rewardId,
	maxRedemptions = 2,
}: {
	id?: string;
	rewardId: string;
	maxRedemptions?: number;
}): CreateRewardProgram => ({
	id,
	when: RewardTriggerEvent.CustomerCreation,
	product_ids: [],
	internal_reward_id: rewardId,
	max_redemptions: maxRedemptions,
	received_by: RewardReceivedBy.Referrer,
});

const onCustomerCreationBoth = ({
	id = "immediate-both",
	rewardId,
	maxRedemptions = 2,
}: {
	id?: string;
	rewardId: string;
	maxRedemptions?: number;
}): CreateRewardProgram => ({
	id,
	when: RewardTriggerEvent.CustomerCreation,
	product_ids: [],
	internal_reward_id: rewardId,
	max_redemptions: maxRedemptions,
	received_by: RewardReceivedBy.All,
});

export const referralPrograms = {
	onCheckoutReferrer,
	onCheckoutBoth,
	onCustomerCreationReferrer,
	onCustomerCreationBoth,
} as const;
