import { type Reward, RewardType } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type {
	CatalogCoupon,
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
	/** Stable ids of the rewards a config can state — the programs that may be stated too. */
	statableInternalIds: Set<string>;
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
					// Narrowed by STATABLE_TYPES above: invoice credits never reach here.
					coupon: getApiCoupon({
						reward,
						planIdByInternalProductId,
						internalProductIdByPriceId,
					}) as CatalogCoupon,
				};

	return {
		rewards: statable.map(toState),
		unstatableIds: new Set(
			rows
				.filter((reward) => !STATABLE_TYPES.has(reward.type))
				.map((reward) => reward.id),
		),
		statableInternalIds: new Set(statable.map((reward) => reward.internal_id)),
		idByInternalId: new Map(rows.map((row) => [row.internal_id, row.id])),
	};
};

/**
 * Only the programs a config could state come back. A program backed by a
 * free-product or invoice-credit reward names an id the catalog never returns,
 * so pulling it would write a config its own lint rejects.
 */
export const loadReferralProgramStates = async ({
	ctx,
	idByInternalId,
	statableInternalIds,
}: {
	ctx: AutumnContext;
	idByInternalId: Map<string, string>;
	statableInternalIds: Set<string>;
}): Promise<{
	programs: ReferralProgramState[];
	/** Public ids of the programs hidden here: absent from the catalog, but
	 * still taken, so a config claiming one is refused rather than colliding. */
	hiddenProgramIds: Set<string>;
}> => {
	const rows = await rewardProgramRepo.list({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
	});

	const programs: ReferralProgramState[] = [];
	const hiddenProgramIds = new Set<string>();
	for (const program of rows) {
		const rewardId = statableInternalIds.has(program.internal_reward_id)
			? idByInternalId.get(program.internal_reward_id)
			: undefined;
		if (!rewardId) {
			if (program.id) hiddenProgramIds.add(program.id);
			continue;
		}
		programs.push({
			internalId: program.internal_id,
			internalRewardId: program.internal_reward_id,
			program: getApiReferralProgram({ rewardProgram: program, rewardId }),
		});
	}

	return { programs, hiddenProgramIds };
};
