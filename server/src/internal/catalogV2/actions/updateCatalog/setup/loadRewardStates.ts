import { type Reward, RewardType } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type {
	CatalogRewardState,
	ReferralProgramState,
} from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext/rewardStatesContext";
import { getApiCoupon } from "@/internal/rewards/apiRewards/getApiCoupon.js";
import { getApiFeatureGrant } from "@/internal/rewards/apiRewards/getApiFeatureGrant.js";
import { getApiReferralProgram } from "@/internal/rewards/apiRewards/getApiReferralProgram.js";
import { resolveCouponPlanIds } from "@/internal/rewards/apiRewards/resolveCouponPlanIds.js";
import {
	rewardProgramRepo,
	rewardRepo,
} from "@/internal/rewards/repos/index.js";

/** The catalog states discount coupons and feature grants; nothing else. */
const STATABLE_TYPES = new Set<RewardType>([
	RewardType.PercentageDiscount,
	RewardType.FixedDiscount,
	RewardType.FeatureGrant,
]);

export type LoadedRewards = {
	rewards: CatalogRewardState[];
	unstatableIds: Set<string>;
	/** Every row, statable or not — programs resolve their reward id from here. */
	idByInternalId: Map<string, string>;
};

export const loadRewardStates = async ({
	ctx,
}: {
	ctx: AutumnContext;
}): Promise<LoadedRewards> => {
	const rows = await rewardRepo.list({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
	});

	const statable = rows.filter((reward) => STATABLE_TYPES.has(reward.type));
	const coupons = statable.filter(
		(reward) => reward.type !== RewardType.FeatureGrant,
	);
	const { internalProductIdByPriceId, planIdByInternalProductId } =
		await resolveCouponPlanIds({ db: ctx.db, rewards: coupons });

	const toState = (reward: Reward): CatalogRewardState =>
		reward.type === RewardType.FeatureGrant
			? {
					internalId: reward.internal_id,
					id: reward.id,
					kind: "feature_grant",
					featureGrant: getApiFeatureGrant({
						reward,
						features: ctx.features,
					}),
				}
			: {
					internalId: reward.internal_id,
					id: reward.id,
					kind: "coupon",
					coupon: getApiCoupon({
						reward,
						planIdByInternalProductId,
						internalProductIdByPriceId,
					}),
				};

	return {
		rewards: statable.map(toState),
		unstatableIds: new Set(
			rows
				.filter((reward) => !STATABLE_TYPES.has(reward.type))
				.map((reward) => reward.id),
		),
		idByInternalId: new Map(rows.map((row) => [row.internal_id, row.id])),
	};
};

export const loadReferralProgramStates = async ({
	ctx,
	idByInternalId,
}: {
	ctx: AutumnContext;
	idByInternalId: Map<string, string>;
}): Promise<ReferralProgramState[]> => {
	const programs = await rewardProgramRepo.list({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
	});

	return programs.flatMap((program) => {
		const rewardId = idByInternalId.get(program.internal_reward_id);
		// A program whose reward the org no longer holds cannot be stated.
		if (!rewardId) return [];
		return [
			{
				internalId: program.internal_id,
				program: getApiReferralProgram({ rewardProgram: program, rewardId }),
			},
		];
	});
};
