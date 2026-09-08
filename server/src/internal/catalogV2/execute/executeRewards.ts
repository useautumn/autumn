import type {
	CatalogAppliedResult,
	CreateRewardParams,
	UpdateRewardParams,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { UpdateCatalogPlan } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogPlan";
import type {
	UpsertReferralProgramPlan,
	UpsertRewardPlan,
} from "@/internal/catalogV2/actions/updateCatalog/types/updateRewardPlan";
import { rewardBranchOf } from "@/internal/catalogV2/actions/updateCatalog/utils/rewardUpdateUtils/rewardBranch";
import { createApiReward } from "@/internal/rewards/actions/createApiReward/createApiReward.js";
import {
	createApiReferralProgram,
	deleteApiReferralProgram,
	updateApiReferralProgram,
} from "@/internal/rewards/actions/referralProgramCrud/index.js";
import {
	deleteApiReward,
	updateApiReward,
} from "@/internal/rewards/actions/rewardCrud/index.js";
import {
	rewardProgramRepo,
	rewardRepo,
} from "@/internal/rewards/repos/index.js";

export type CatalogRewardResults = {
	rewards: CatalogAppliedResult[];
	referralPrograms: CatalogAppliedResult[];
};

/** The create body: the branch minus the stable id, which the server owns. */
const createParamsFor = ({
	upsert,
}: {
	upsert: UpsertRewardPlan;
}): CreateRewardParams => {
	const branch = rewardBranchOf(upsert.params);
	if (branch.kind === "coupon") {
		const { internal_id: _internalId, ...coupon } = branch.body;
		return { coupon };
	}
	const { internal_id: _internalId, ...featureGrant } = branch.body;
	return { feature_grant: featureGrant };
};

const updateParamsFor = ({
	upsert,
}: {
	upsert: UpsertRewardPlan;
}): UpdateRewardParams => {
	const branch = rewardBranchOf(upsert.params);
	if (branch.kind === "coupon") {
		const { id: _id, internal_id: _internalId, ...coupon } = branch.body;
		return { reward_id: upsert.rewardId, coupon };
	}
	const { id: _id, internal_id: _internalId, ...featureGrant } = branch.body;
	return { reward_id: upsert.rewardId, feature_grant: featureGrant };
};

const programUpdateParamsFor = ({
	upsert,
}: {
	upsert: UpsertReferralProgramPlan;
}) => ({
	referral_program_id: upsert.referralProgramId,
	reward_id: upsert.desired.reward_id,
	redeem_on: upsert.desired.redeem_on,
	received_by: upsert.desired.received_by,
	max_redemptions: upsert.desired.max_redemptions,
	plan_ids: upsert.desired.plan_ids,
	exclude_trial: upsert.desired.exclude_trial,
});

const internalIdOfReward = async ({
	ctx,
	rewardId,
}: {
	ctx: AutumnContext;
	rewardId: string;
}): Promise<string | null> => {
	const reward = await rewardRepo.get({
		db: ctx.db,
		idOrInternalId: rewardId,
		orgId: ctx.org.id,
		env: ctx.env,
	});
	return reward?.internal_id ?? null;
};

/**
 * Programs go before rewards on the way out and after them on the way in: a
 * program cannot outlive the reward it points at, and cannot precede it either.
 */
export const executeRewards = async ({
	ctx,
	updateCatalogPlan,
}: {
	ctx: AutumnContext;
	updateCatalogPlan: UpdateCatalogPlan;
}): Promise<CatalogRewardResults> => {
	for (const remove of updateCatalogPlan.removeReferralPrograms) {
		await deleteApiReferralProgram({
			ctx,
			params: { referral_program_id: remove.referralProgramId },
		});
	}
	for (const remove of updateCatalogPlan.removeRewards) {
		await deleteApiReward({ ctx, params: { reward_id: remove.rewardId } });
	}

	const rewards: CatalogAppliedResult[] = [];
	for (const upsert of updateCatalogPlan.upsertRewards) {
		if (upsert.internalId === null) {
			await createApiReward({ ctx, params: createParamsFor({ upsert }) });
			rewards.push({
				id: upsert.rewardId,
				internal_id: await internalIdOfReward({
					ctx,
					rewardId: upsert.rewardId,
				}),
				action: "create",
			});
			continue;
		}
		if (upsert.previousAttributes) {
			await updateApiReward({ ctx, params: updateParamsFor({ upsert }) });
		}
		rewards.push({
			id: upsert.rewardId,
			internal_id: upsert.internalId,
			action: upsert.previousAttributes ? "update" : "none",
		});
	}

	const referralPrograms: CatalogAppliedResult[] = [];
	for (const upsert of updateCatalogPlan.upsertReferralPrograms) {
		if (upsert.internalId === null) {
			await createApiReferralProgram({
				ctx,
				params: {
					id: upsert.referralProgramId,
					reward_id: upsert.desired.reward_id,
					redeem_on: upsert.desired.redeem_on,
					received_by: upsert.desired.received_by,
					max_redemptions: upsert.desired.max_redemptions,
					plan_ids: upsert.desired.plan_ids,
					exclude_trial: upsert.desired.exclude_trial,
				},
			});
			const created = await rewardProgramRepo.get({
				db: ctx.db,
				idOrInternalId: upsert.referralProgramId,
				orgId: ctx.org.id,
				env: ctx.env,
			});
			referralPrograms.push({
				id: upsert.referralProgramId,
				internal_id: created?.internal_id ?? null,
				action: "create",
			});
			continue;
		}
		if (upsert.previousAttributes) {
			await updateApiReferralProgram({
				ctx,
				params: programUpdateParamsFor({ upsert }),
			});
		}
		referralPrograms.push({
			id: upsert.referralProgramId,
			internal_id: upsert.internalId,
			action: upsert.previousAttributes ? "update" : "none",
		});
	}

	return {
		rewards: [
			...rewards,
			...updateCatalogPlan.removeRewards.map((remove) => ({
				id: remove.rewardId,
				internal_id: remove.internalId,
				action: "delete" as const,
			})),
		],
		referralPrograms: [
			...referralPrograms,
			...updateCatalogPlan.removeReferralPrograms.map((remove) => ({
				id: remove.referralProgramId,
				internal_id: remove.internalId,
				action: "delete" as const,
			})),
		],
	};
};
