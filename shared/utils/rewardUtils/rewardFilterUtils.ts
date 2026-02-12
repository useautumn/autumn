import type { Reward, RewardProgram } from "../../index.js";

/**
 * Checks if a reward is applicable to a specific product.
 * A reward applies if:
 * - It has `apply_to_all: true` in its discount_config, OR
 * - There's a reward program linking it to this product
 */
export const isRewardApplicableToProduct = ({
	reward,
	rewardPrograms,
	productId,
}: {
	reward: Reward;
	rewardPrograms: RewardProgram[];
	productId: string;
}): boolean => {
	// Rewards with apply_to_all are applicable to all products
	if (reward.discount_config?.apply_to_all) return true;

	// Find reward programs that link this reward to products
	const linkedPrograms = rewardPrograms.filter(
		(program) => program.internal_reward_id === reward.internal_id,
	);

	// Check if any linked program includes this product
	// Note: product_ids defaults to [""] in DB, so filter out empty strings
	return linkedPrograms.some((program) => {
		const productIds = (program.product_ids || []).filter((id) => id !== "");
		return productIds.includes(productId);
	});
};

/**
 * Filters rewards to only those applicable to a specific product.
 * If no productId is provided, returns all rewards.
 */
export const filterRewardsByProduct = ({
	rewards,
	rewardPrograms,
	productId,
}: {
	rewards: Reward[];
	rewardPrograms: RewardProgram[];
	productId: string | undefined;
}): Reward[] => {
	if (!productId) return rewards;

	return rewards.filter((reward) =>
		isRewardApplicableToProduct({ reward, rewardPrograms, productId }),
	);
};
