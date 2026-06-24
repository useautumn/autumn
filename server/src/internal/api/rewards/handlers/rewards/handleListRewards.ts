import {
	AffectedResource,
	type ApiCouponV0,
	type ApiFeatureGrantV0,
	applyResponseVersionChangesToArray,
	RewardsListParamsSchema,
	Scopes,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { rewardRepo } from "@/internal/rewards/repos/index.js";

export const handleListRewards = createRoute({
	scopes: [Scopes.Rewards.Read],
	body: RewardsListParamsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { org, env, db, features } = ctx;

		const { coupons, feature_grants } = await rewardRepo.listApiRewards({
			db,
			orgId: org.id,
			env,
			features,
		});

		return c.json({
			coupons: applyResponseVersionChangesToArray<ApiCouponV0>({
				inputArray: coupons,
				targetVersion: ctx.apiVersion,
				resource: AffectedResource.Coupon,
				ctx,
			}),
			feature_grants: applyResponseVersionChangesToArray<ApiFeatureGrantV0>({
				inputArray: feature_grants,
				targetVersion: ctx.apiVersion,
				resource: AffectedResource.FeatureGrant,
				ctx,
			}),
		});
	},
});
