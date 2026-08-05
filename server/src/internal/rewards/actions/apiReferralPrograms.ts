import {
	type ApiReferralProgramV0,
	type DeleteReferralProgramParams,
	type DeleteReferralProgramResponse,
	ErrCode,
	type GetReferralProgramParams,
	RecaseError,
	type ReferralProgramsListResponse,
	type Reward,
	type RewardProgram,
	rewards,
	type UpdateReferralProgramParams,
} from "@autumn/shared";
import { and, eq, inArray } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	validateRewardProgramTrigger,
	validateRewardTypeSupported,
} from "@/internal/api/rewards/handlers/rewardPrograms/validateRewardProgram.js";
import { getApiReferralProgram } from "../apiRewards/getApiReferralProgram.js";
import { rewardProgramRepo, rewardRepo } from "../repos/index.js";

const requireProgram = async ({
	ctx,
	referralProgramId,
}: {
	ctx: AutumnContext;
	referralProgramId: string;
}): Promise<RewardProgram> => {
	const { db, org, env } = ctx;
	const program = await rewardProgramRepo.get({
		db,
		idOrInternalId: referralProgramId,
		orgId: org.id,
		env,
	});

	if (!program) {
		throw new RecaseError({
			message: `Referral program ${referralProgramId} not found`,
			code: ErrCode.RewardProgramNotFound,
			statusCode: 404,
		});
	}

	return program;
};

const requireLinkableReward = async ({
	ctx,
	rewardId,
}: {
	ctx: AutumnContext;
	rewardId: string;
}): Promise<Reward> => {
	const { db, org, env } = ctx;
	const reward = await rewardRepo.get({
		db,
		idOrInternalId: rewardId,
		orgId: org.id,
		env,
	});

	if (!reward) {
		throw new RecaseError({
			message: `Reward ${rewardId} not found`,
			code: ErrCode.RewardNotFound,
			statusCode: 404,
		});
	}

	validateRewardTypeSupported(reward);
	return reward;
};

/** Programs reference rewards by internal id, but the API speaks public ids */
const rewardIdByInternalId = async ({
	ctx,
	programs,
}: {
	ctx: AutumnContext;
	programs: RewardProgram[];
}) => {
	const { db, org, env } = ctx;
	const internalIds = [
		...new Set(programs.map((program) => program.internal_reward_id)),
	];

	if (internalIds.length === 0) return new Map<string, string>();

	const rows = (await db.query.rewards.findMany({
		where: and(
			inArray(rewards.internal_id, internalIds),
			eq(rewards.org_id, org.id),
			eq(rewards.env, env),
		),
	})) as Reward[];

	return new Map(rows.map((reward) => [reward.internal_id, reward.id]));
};

const toApiProgram = async ({
	ctx,
	rewardProgram,
}: {
	ctx: AutumnContext;
	rewardProgram: RewardProgram;
}): Promise<ApiReferralProgramV0> => {
	const rewardIds = await rewardIdByInternalId({
		ctx,
		programs: [rewardProgram],
	});

	return getApiReferralProgram({
		rewardProgram,
		rewardId: rewardIds.get(rewardProgram.internal_reward_id) ?? "",
	});
};

/** Omitted fields keep whatever the stored program already has */
const mergeProgramUpdate = ({
	existing,
	params,
}: {
	existing: RewardProgram;
	params: UpdateReferralProgramParams;
}) => ({
	when: params.redeem_on ?? existing.when,
	received_by: params.received_by ?? existing.received_by,
	product_ids:
		params.plan_ids !== undefined
			? (params.plan_ids ?? undefined)
			: existing.product_ids,
	max_redemptions:
		params.max_redemptions !== undefined
			? (params.max_redemptions ?? undefined)
			: existing.max_redemptions,
	exclude_trial:
		params.exclude_trial !== undefined
			? (params.exclude_trial ?? undefined)
			: existing.exclude_trial,
});

export const listApiReferralPrograms = async ({
	ctx,
}: {
	ctx: AutumnContext;
}): Promise<ReferralProgramsListResponse> => {
	const { db, org, env } = ctx;

	// 1. Fetch
	const programs = await rewardProgramRepo.list({ db, orgId: org.id, env });

	// 2. Map internal reward ids back to public ids
	const rewardIds = await rewardIdByInternalId({ ctx, programs });

	return {
		list: programs.map((rewardProgram) =>
			getApiReferralProgram({
				rewardProgram,
				rewardId: rewardIds.get(rewardProgram.internal_reward_id) ?? "",
			}),
		),
	};
};

export const getApiReferralProgramById = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: GetReferralProgramParams;
}): Promise<ApiReferralProgramV0> => {
	const rewardProgram = await requireProgram({
		ctx,
		referralProgramId: params.referral_program_id,
	});

	return toApiProgram({ ctx, rewardProgram });
};

export const updateApiReferralProgram = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: UpdateReferralProgramParams;
}): Promise<ApiReferralProgramV0> => {
	const { db, org, env } = ctx;

	// 1. Load
	const existing = await requireProgram({
		ctx,
		referralProgramId: params.referral_program_id,
	});

	// 2. Resolve the linked reward, if it is being changed
	const reward = params.reward_id
		? await requireLinkableReward({ ctx, rewardId: params.reward_id })
		: undefined;

	// 3. Merge and validate
	const merged = mergeProgramUpdate({ existing, params });
	validateRewardProgramTrigger({
		when: merged.when,
		productIds: merged.product_ids,
		maxRedemptions: merged.max_redemptions,
	});

	// 4. Persist
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

	return toApiProgram({ ctx, rewardProgram });
};

export const deleteApiReferralProgram = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: DeleteReferralProgramParams;
}): Promise<DeleteReferralProgramResponse> => {
	const { db, org, env } = ctx;

	const existing = await requireProgram({
		ctx,
		referralProgramId: params.referral_program_id,
	});

	await rewardProgramRepo.delete({
		db,
		idOrInternalId: existing.internal_id,
		orgId: org.id,
		env,
	});

	return { success: true };
};
