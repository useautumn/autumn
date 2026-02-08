import {
	type CreateRewardProgram,
	RewardReceivedBy,
	RewardTriggerEvent,
} from "@autumn/shared";

/**
 * Referral program that triggers on checkout, reward goes to referrer only
 * @param id - Program ID (default: "checkout-referrer")
 * @param rewardId - The reward ID to use
 * @param productIds - Product IDs that trigger this program
 * @param maxRedemptions - Max number of redemptions (default: 2)
 */
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

/**
 * Referral program that triggers on checkout, reward goes to both referrer and redeemer
 * @param id - Program ID (default: "checkout-both")
 * @param rewardId - The reward ID to use
 * @param productIds - Product IDs that trigger this program
 * @param maxRedemptions - Max number of redemptions (default: 2)
 */
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

/**
 * Referral program that triggers immediately on customer creation, reward goes to referrer
 * @param id - Program ID (default: "immediate-referrer")
 * @param rewardId - The reward ID to use
 * @param maxRedemptions - Max number of redemptions (default: 2)
 */
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

/**
 * Referral program that triggers immediately on customer creation, reward goes to both
 * @param id - Program ID (default: "immediate-both")
 * @param rewardId - The reward ID to use
 * @param maxRedemptions - Max number of redemptions (default: 2)
 */
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
