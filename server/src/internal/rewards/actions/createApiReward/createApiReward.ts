import type { CreateRewardParams, CreateRewardResponse } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { createApiCoupon } from "./createApiCoupon.js";
import { createApiFeatureGrant } from "./createApiFeatureGrant.js";

export const createApiReward = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: CreateRewardParams;
}): Promise<CreateRewardResponse> =>
	params.feature_grant
		? createApiFeatureGrant({ ctx, featureGrant: params.feature_grant })
		: createApiCoupon({ ctx, coupon: params.coupon! });
