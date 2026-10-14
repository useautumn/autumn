import type { Reward, RewardProgram } from "../../index";

export const isRewardApplicableToProduct = ({
	reward,
	rewardPrograms,
	productId,
}: {
	reward: Reward;
	rewardPrograms: RewardProgram[];
	productId: string;
}): boolean => {
	if (reward.discount_config?.apply_to_all) return true;

	const linkedPrograms = rewardPrograms.filter(
		(program) => program.internal_reward_id === reward.internal_id,
	);

	return linkedPrograms.some((program) => {
		const productIds = (program.product_ids || []).filter((id) => id !== "");
		return productIds.includes(productId);
	});
};

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
