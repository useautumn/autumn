import {
	type ApiReferralProgramV0,
	type CreateReferralProgramParams,
	ErrCode,
	RecaseError,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	validateRewardProgramTrigger,
	validateRewardTypeSupported,
} from "@/internal/api/rewards/handlers/rewardPrograms/validateRewardProgram.js";
import { getApiReferralProgram } from "../../apiRewards/getApiReferralProgram.js";
import { rewardProgramRepo, rewardRepo } from "../../repos/index.js";
import { constructRewardProgram } from "../../rewardUtils.js";

export const createApiReferralProgram = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: CreateReferralProgramParams;
}): Promise<ApiReferralProgramV0> => {
	const { db, org, env } = ctx;

	const existingProgram = await rewardProgramRepo.get({
		db,
		idOrInternalId: params.id,
		orgId: org.id,
		env,
	});

	if (existingProgram) {
		throw new RecaseError({
			message: `Referral program ${params.id} already exists`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	const reward = await rewardRepo.get({
		db,
		idOrInternalId: params.reward_id,
		orgId: org.id,
		env,
	});

	if (!reward) {
		throw new RecaseError({
			message: `Reward ${params.reward_id} not found`,
			code: ErrCode.RewardNotFound,
			statusCode: 404,
		});
	}

	validateRewardTypeSupported(reward);
	validateRewardProgramTrigger({
		when: params.redeem_on,
		productIds: params.plan_ids,
		maxRedemptions: params.max_redemptions,
	});

	const rewardProgram = await rewardProgramRepo.insert({
		db,
		data: constructRewardProgram({
			rewardProgramData: {
				id: params.id,
				when: params.redeem_on,
				received_by: params.received_by,
				internal_reward_id: reward.internal_id,
				product_ids: params.plan_ids ?? undefined,
				exclude_trial: params.exclude_trial ?? undefined,
				max_redemptions: params.max_redemptions ?? undefined,
			},
			orgId: org.id,
			env,
		}),
	});

	return getApiReferralProgram({ rewardProgram, rewardId: reward.id });
};
