import type {
	ApiReferralProgramV0,
	UpdateReferralProgramParams,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { validateRewardProgramTrigger } from "@/internal/api/rewards/handlers/rewardPrograms/validateRewardProgram.js";
import { rewardProgramRepo } from "../../repos/index.js";
import {
	mergeProgramUpdate,
	requireLinkableReward,
	requireProgram,
	toApiProgram,
} from "./referralProgramUtils.js";

export const updateApiReferralProgram = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: UpdateReferralProgramParams;
}): Promise<ApiReferralProgramV0> => {
	const { db, org, env } = ctx;

	const existing = await requireProgram({
		ctx,
		referralProgramId: params.referral_program_id,
	});

	const reward = params.reward_id
		? await requireLinkableReward({ ctx, rewardId: params.reward_id })
		: undefined;

	const merged = mergeProgramUpdate({ existing, params });
	validateRewardProgramTrigger({
		when: merged.when,
		productIds: merged.product_ids,
		maxRedemptions: merged.max_redemptions,
	});

	const rewardProgram = await rewardProgramRepo.update({
		db,
		idOrInternalId: params.referral_program_id,
		orgId: org.id,
		env,
		data: {
			...merged,
			internal_reward_id: reward?.internal_id ?? existing.internal_reward_id,
		},
	});

	return toApiProgram({ ctx, rewardProgram, reward });
};
