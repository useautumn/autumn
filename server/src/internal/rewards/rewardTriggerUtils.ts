import type { CreateRewardProgram, RewardProgram } from "@autumn/shared";
import { generateId } from "@/utils/genUtils.js";

export const constructRewardProgram = ({
	rewardProgramData,
	orgId,
	env,
}: {
	rewardProgramData: CreateRewardProgram;
	orgId: string;
	env: string;
}) => {
	const rewardProgram: RewardProgram = {
		...rewardProgramData,
		internal_id: generateId("rs"),
		unlimited_redemptions: false,
		created_at: Date.now(),
		org_id: orgId,
		env,
	};

	return rewardProgram;
};
