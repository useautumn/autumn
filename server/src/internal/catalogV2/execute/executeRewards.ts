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

/** The create response is the public V0 shape, which carries no stable id, so
 * the row is read back. Push pins the fixture with it. */
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

const internalIdOfProgram = async ({
	ctx,
	referralProgramId,
}: {
	ctx: AutumnContext;
	referralProgramId: string;
}): Promise<string | null> => {
	const program = await rewardProgramRepo.get({
		db: ctx.db,
		idOrInternalId: referralProgramId,
		orgId: ctx.org.id,
		env: ctx.env,
	});
	return program?.internal_id ?? null;
};

/**
 * Two orderings pull against each other. A promo code is owned by exactly one
 * reward, so replacing a reward while keeping its code needs the old row gone
 * BEFORE the new one is written. A referral program cannot point at a reward
 * that does not exist, so a repoint needs the new row written BEFORE the old
 * one goes. Splitting the deletes satisfies both: everything unlinked leaves
 * first and frees its codes, and only the rows a surviving program still holds
 * wait until after the repoint.
 */
export const executeRewards = async ({
	ctx,
	updateCatalogPlan,
	linkedInternalRewardIds,
}: {
	ctx: AutumnContext;
	updateCatalogPlan: UpdateCatalogPlan;
	/** Stable ids of rewards a program that survives this push still links. */
	linkedInternalRewardIds: Set<string>;
}): Promise<CatalogRewardResults> => {
	for (const remove of updateCatalogPlan.removeReferralPrograms) {
		await deleteApiReferralProgram({
			ctx,
			params: { referral_program_id: remove.referralProgramId },
		});
	}

	const [deferredRemovals, freeRemovals] = [
		updateCatalogPlan.removeRewards.filter((remove) =>
			linkedInternalRewardIds.has(remove.internalId),
		),
		updateCatalogPlan.removeRewards.filter(
			(remove) => !linkedInternalRewardIds.has(remove.internalId),
		),
	];
	for (const remove of freeRemovals) {
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
			const created = await createApiReferralProgram({
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
			referralPrograms.push({
				id: created.id,
				internal_id: await internalIdOfProgram({
					ctx,
					referralProgramId: upsert.referralProgramId,
				}),
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

	// Last: the links that held these have been repointed just above.
	for (const remove of deferredRemovals) {
		await deleteApiReward({ ctx, params: { reward_id: remove.rewardId } });
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
