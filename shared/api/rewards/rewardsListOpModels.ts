import { z } from "zod/v4";
import { ApiCouponV0Schema } from "./coupons/apiCouponV0.js";
import { ApiFeatureGrantV0Schema } from "./featureGrants/apiFeatureGrantV0.js";

export const ApiRewardsListV0Schema = z.object({
	coupons: z.array(ApiCouponV0Schema).meta({
		description: "The list of coupons configured for the organization.",
	}),
	feature_grants: z.array(ApiFeatureGrantV0Schema).meta({
		description: "The list of feature grants configured for the organization.",
	}),
});

export type ApiRewardsListV0 = z.infer<typeof ApiRewardsListV0Schema>;

export const RewardsListParamsSchema = z.object({}).optional();

export type RewardsListParams = z.infer<typeof RewardsListParamsSchema>;
