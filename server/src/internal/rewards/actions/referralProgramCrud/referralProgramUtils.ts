import {
	type ApiReferralProgramV0,
	ErrCode,
	RecaseError,
	type Reward,
	type RewardProgram,
	rewards,
	type UpdateReferralProgramParams,
} from "@autumn/shared";
import { and, eq, inArray } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { validateRewardTypeSupported } from "@/internal/api/rewards/handlers/rewardPrograms/validateRewardProgram.js";
import { getApiReferralProgram } from "../../apiRewards/getApiReferralProgram.js";
import { rewardProgramRepo } from "../../repos/index.js";
import { requireApiReward } from "../rewardCrud/apiRewardUtils.js";

export const requireProgram = async ({
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

export const requireLinkableReward = async ({
	ctx,
	rewardId,
}: {
	ctx: AutumnContext;
	rewardId: string;
}): Promise<Reward> => {
	const reward = await requireApiReward({ ctx, rewardId });
	validateRewardTypeSupported(reward);

	return reward;
};

/** Programs reference rewards by internal id, but the API speaks public ids */
export const rewardIdByInternalId = async ({
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

export const toApiProgram = async ({
	ctx,
	rewardProgram,
	reward,
}: {
	ctx: AutumnContext;
	rewardProgram: RewardProgram;
	reward?: Reward;
}): Promise<ApiReferralProgramV0> => {
	if (reward) {
		return getApiReferralProgram({ rewardProgram, rewardId: reward.id });
	}

	const rewardIds = await rewardIdByInternalId({
		ctx,
		programs: [rewardProgram],
	});

	return getApiReferralProgram({
		rewardProgram,
		rewardId: rewardIds.get(rewardProgram.internal_reward_id) ?? "",
	});
};

/** An omitted field keeps its stored value */
const patchField = <T>({
	patch,
	existing,
}: {
	patch: T | undefined;
	existing: T | undefined;
}) => patch ?? existing;

export const mergeProgramUpdate = ({
	existing,
	params,
}: {
	existing: RewardProgram;
	params: UpdateReferralProgramParams;
}) => ({
	when: params.redeem_on ?? existing.when,
	received_by: params.received_by ?? existing.received_by,
	product_ids: patchField({
		patch: params.plan_ids,
		existing: existing.product_ids,
	}),
	max_redemptions: patchField({
		patch: params.max_redemptions,
		existing: existing.max_redemptions,
	}),
	exclude_trial: patchField({
		patch: params.exclude_trial,
		existing: existing.exclude_trial,
	}),
});
