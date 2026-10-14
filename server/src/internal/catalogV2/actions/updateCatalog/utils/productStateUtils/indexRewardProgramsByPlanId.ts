import type { RewardProgram } from "@autumn/shared";

export const indexRewardProgramsByPlanId = ({
	rewardPrograms,
}: {
	rewardPrograms: RewardProgram[];
}): Map<string, RewardProgram[]> => {
	const rewardProgramsByPlanId = new Map<string, RewardProgram[]>();
	for (const program of rewardPrograms) {
		for (const productId of program.product_ids ?? []) {
			const existing = rewardProgramsByPlanId.get(productId) ?? [];
			existing.push(program);
			rewardProgramsByPlanId.set(productId, existing);
		}
	}
	return rewardProgramsByPlanId;
};
