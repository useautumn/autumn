import {
	type CreateRewardParams,
	type CreateRewardResponse,
	ErrCode,
	RecaseError,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { createApiCoupon } from "./createApiCoupon.js";
import { createApiFeatureGrant } from "./createApiFeatureGrant.js";

export const createApiReward = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: CreateRewardParams;
}): Promise<CreateRewardResponse> => {
	const { coupon, feature_grant: featureGrant } = params;
	if (coupon && !featureGrant) return createApiCoupon({ ctx, coupon });
	if (featureGrant && !coupon)
		return createApiFeatureGrant({ ctx, featureGrant });
	throw new RecaseError({
		message: "Provide exactly one of coupon or feature_grant",
		code: ErrCode.InvalidReward,
		statusCode: 400,
	});
};
