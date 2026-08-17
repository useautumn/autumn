import {
	ErrCode,
	type GetRewardResponse,
	RecaseError,
	type Reward,
	RewardType,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getApiCoupon } from "../../apiRewards/getApiCoupon.js";
import { getApiFeatureGrant } from "../../apiRewards/getApiFeatureGrant.js";
import { resolveCouponPlanIds } from "../../apiRewards/resolveCouponPlanIds.js";
import { rewardRepo } from "../../repos/index.js";

export const requireApiReward = async ({
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

	// Free product rewards are deprecated and never exposed on the API
	if (reward.type === RewardType.FreeProduct) {
		throw new RecaseError({
			message: `Reward ${rewardId} is a free product reward, which is not available on the API`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	return reward;
};

/** Feature grants map straight from the row; coupons need their plan ids resolved */
export const toApiRewardResponse = async ({
	ctx,
	reward,
}: {
	ctx: AutumnContext;
	reward: Reward;
}): Promise<GetRewardResponse> => {
	const { db, features } = ctx;

	if (reward.type === RewardType.FeatureGrant) {
		return { feature_grant: getApiFeatureGrant({ reward, features }) };
	}

	const { internalProductIdByPriceId, planIdByInternalProductId } =
		await resolveCouponPlanIds({ db, rewards: [reward] });

	return {
		coupon: getApiCoupon({
			reward,
			planIdByInternalProductId,
			internalProductIdByPriceId,
		}),
	};
};
