import type { GetRewardParams, GetRewardResponse } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { requireApiReward, toApiRewardResponse } from "./apiRewardUtils.js";

export const getApiRewardById = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: GetRewardParams;
}): Promise<GetRewardResponse> => {
	const reward = await requireApiReward({ ctx, rewardId: params.reward_id });

	return toApiRewardResponse({ ctx, reward });
};
