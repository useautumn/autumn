import {
	type CreateReward,
	CreateRewardParamsSchema,
	ErrCode,
	FeatureNotFoundError,
	FeatureType,
	findFeatureById,
	ProductNotFoundError,
	RecaseError,
	RewardType,
	Scopes,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { createReward } from "@/internal/rewards/actions/createReward.js";
import { getApiCoupon } from "@/internal/rewards/apiRewards/getApiCoupon.js";
import { getApiFeatureGrant } from "@/internal/rewards/apiRewards/getApiFeatureGrant.js";

export const handleCreateReward = createRoute({
	scopes: [Scopes.Rewards.Write],
	body: CreateRewardParamsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const params = c.req.valid("json");

		if ("feature_grant" in params) {
			const { feature_grant: featureGrant } = params;
			const entitlements = featureGrant.grants.map((grant) => {
				const feature = findFeatureById({
					features: ctx.features,
					featureId: grant.feature_id,
				});
				if (!feature) {
					throw new FeatureNotFoundError({ featureId: grant.feature_id });
				}
				if (
					(feature.type === FeatureType.Boolean) !==
					(grant.included === null)
				) {
					throw new RecaseError({
						message:
							feature.type === FeatureType.Boolean
								? `Feature ${feature.id} must have included set to null`
								: `Feature ${feature.id} must have a positive included value`,
						code: ErrCode.InvalidReward,
						statusCode: 400,
					});
				}

				return {
					internal_feature_id: feature.internal_id,
					allowance: grant.included ?? undefined,
					expiry: grant.expiry
						? {
								duration: grant.expiry.type,
								length: grant.expiry.length,
							}
						: undefined,
				};
			});
			const rewardData: CreateReward = {
				id: featureGrant.id,
				name: featureGrant.name,
				type: RewardType.FeatureGrant,
				promo_codes: featureGrant.promo_codes.map(({ code, max_uses }) => ({
					code,
					global_max_redemption: max_uses ?? undefined,
				})),
				entitlements,
			};
			const [reward] = await createReward({ ctx, rewardData });
			return c.json({
				feature_grant: getApiFeatureGrant({
					reward,
					features: ctx.features,
				}),
			});
		}

		const { coupon } = params;
		const plans =
			coupon.plan_ids === null
				? []
				: await ProductService.listDefault({
						db: ctx.db,
						orgId: ctx.org.id,
						env: ctx.env,
						inIds: coupon.plan_ids,
					});
		const planById = new Map(plans.map((plan) => [plan.id, plan]));
		for (const planId of coupon.plan_ids ?? []) {
			if (!planById.has(planId))
				throw new ProductNotFoundError({ productId: planId });
		}

		const rewardData: CreateReward = {
			id: coupon.id,
			name: coupon.name,
			type: coupon.type,
			promo_codes: coupon.promo_codes.map((promoCode) => ({
				code: promoCode.code,
				global_max_redemption: promoCode.global_max_redemption ?? undefined,
				first_time_transaction: promoCode.first_time_transaction ?? undefined,
			})),
			discount_config: {
				discount_value: coupon.value,
				duration_type: coupon.duration.type,
				duration_value: coupon.duration.length ?? 0,
				should_rollover: true,
				apply_to_all: coupon.plan_ids === null,
				price_ids: plans.flatMap((plan) => plan.prices.map(({ id }) => id)),
			},
		};
		const [reward] = await createReward({ ctx, rewardData });
		const planIdByInternalProductId = new Map(
			plans.map((plan) => [plan.internal_id, plan.id]),
		);
		const internalProductIdByPriceId = new Map(
			plans.flatMap((plan) =>
				plan.prices.map((price) => [price.id, plan.internal_id] as const),
			),
		);

		return c.json({
			coupon: getApiCoupon({
				reward,
				planIdByInternalProductId,
				internalProductIdByPriceId,
			}),
		});
	},
});
