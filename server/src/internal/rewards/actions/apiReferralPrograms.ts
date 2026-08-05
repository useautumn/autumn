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

const notFound = (id: string) =>
	new RecaseError({
		message: `Referral program ${id} not found`,
		code: ErrCode.RewardProgramNotFound,
		statusCode: 404,
	});

const requireProgram = async ({
	ctx,
	id,
}: {
	ctx: AutumnContext;
	id: string;
}): Promise<RewardProgram> => {
	const { db, org, env } = ctx;
	const program = await rewardProgramRepo.get({
		db,
		idOrInternalId: id,
		orgId: org.id,
		env,
	});

	if (!program) throw notFound(id);
	return program;
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

export const listApiReferralPrograms = async ({
	ctx,
}: {
	ctx: AutumnContext;
}): Promise<ReferralProgramsListResponse> => {
	const { db, org, env } = ctx;

	const programs = await rewardProgramRepo.list({ db, orgId: org.id, env });
	const rewardIds = await rewardIdByInternalId({ ctx, programs });

	return {
		referral_programs: programs.map((rewardProgram) =>
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
	const rewardProgram = await requireProgram({ ctx, id: params.id });
	const rewardIds = await rewardIdByInternalId({
		ctx,
		programs: [rewardProgram],
	});

	return getApiReferralProgram({
		rewardProgram,
		rewardId: rewardIds.get(rewardProgram.internal_reward_id) ?? "",
	});
};

export const updateApiReferralProgram = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: UpdateReferralProgramParams;
}): Promise<ApiReferralProgramV0> => {
	const { db, org, env } = ctx;
	const existing = await requireProgram({ ctx, id: params.id });

	let internalRewardId = existing.internal_reward_id;
	let rewardId = params.reward_id;

	if (params.reward_id) {
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
		internalRewardId = reward.internal_id;
		rewardId = reward.id;
	}

	// Omitted fields keep their current value, so validate the merged result
	const merged = {
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
	};

	validateRewardProgramTrigger({
		when: merged.when,
		productIds: merged.product_ids,
		maxRedemptions: merged.max_redemptions,
	});

	const rewardProgram = await rewardProgramRepo.update({
		db,
		idOrInternalId: params.id,
		orgId: org.id,
		env,
		data: { ...merged, internal_reward_id: internalRewardId },
	});

	if (!rewardId) {
		const rewardIds = await rewardIdByInternalId({
			ctx,
			programs: [rewardProgram],
		});
		rewardId = rewardIds.get(internalRewardId) ?? "";
	}

	return getApiReferralProgram({ rewardProgram, rewardId });
};

export const deleteApiReferralProgram = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: DeleteReferralProgramParams;
}): Promise<DeleteReferralProgramResponse> => {
	const { db, org, env } = ctx;
	const existing = await requireProgram({ ctx, id: params.id });

	await rewardProgramRepo.delete({
		db,
		idOrInternalId: existing.internal_id,
		orgId: org.id,
		env,
	});

	return { id: existing.id, deleted: true };
};
