import {
	CreateRewardSchema,
	ErrCode,
	isFixedPrice,
	RecaseError,
	RewardCategory,
	Scopes,
} from "@autumn/shared";
import { z } from "zod/v4";
import { createStripeCoupon } from "@/external/stripe/stripeCouponUtils/stripeCouponUtils.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { PlanService } from "@/internal/products/PlanService.js";
import { PriceService } from "@/internal/products/prices/PriceService.js";
import { pricesOnlyOneOff } from "@/internal/products/prices/priceUtils.js";
import { isFreeProduct } from "@/internal/products/productUtils.js";
import { rewardRepo } from "@/internal/rewards/repos/index.js";
import {
	constructReward,
	getRewardCat,
	initRewardStripePrices,
} from "@/internal/rewards/rewardUtils.js";

const CreateCouponQuerySchema = z.object({
	legacyStripe: z.boolean().optional(),
});

export const handleCreateCoupon = createRoute({
	scopes: [Scopes.Rewards.Write],
	body: CreateRewardSchema,
	query: CreateCouponQuerySchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { db, org, env, logger } = ctx;
		const rewardData = c.req.valid("json");
		const { legacyStripe } = c.req.valid("query");

		const newReward = constructReward({
			reward: rewardData,
			orgId: org.id,
			env,
			features: ctx.features,
		});

		// Reject duplicate reward id / promo code before any Stripe side effects.
		const codes = newReward.promo_codes.map((promo) => promo.code);

		if (new Set(codes).size !== codes.length) {
			throw new RecaseError({
				message: "Promo codes must be unique within a reward",
				code: ErrCode.DuplicatePromoCode,
				statusCode: 400,
			});
		}

		const existingRewards = await rewardRepo.getByIdOrCode({
			db,
			codes: [newReward.id, ...codes],
			orgId: org.id,
			env,
		});

		if (existingRewards.some((reward) => reward.id === newReward.id)) {
			throw new RecaseError({
				message: `Reward with id ${newReward.id} already exists`,
				code: ErrCode.DuplicateRewardId,
				statusCode: 400,
			});
		}

		const takenCode = codes.find((code) =>
			existingRewards.some((reward) =>
				reward.promo_codes.some((promo) => promo.code === code),
			),
		);
		if (takenCode) {
			throw new RecaseError({
				message: `Promo code ${takenCode} is already in use by another reward`,
				code: ErrCode.DuplicatePromoCode,
				statusCode: 400,
			});
		}

		if (getRewardCat(newReward) === RewardCategory.Discount) {
			const discountConfig = newReward.discount_config;

			const [prices] = await Promise.all([
				PriceService.getInIds({
					db,
					ids: discountConfig!.price_ids || [],
				}),
			]);

			await initRewardStripePrices({
				ctx,
				prices,
			});

			await createStripeCoupon({
				reward: newReward,
				org,
				env,
				prices,
				logger,
				legacyVersion: legacyStripe,
			});
		}

		if (
			getRewardCat(newReward) === RewardCategory.FreeProduct &&
			newReward.free_product_id
		) {
			const fullProduct = await PlanService.getFull({
				db,
				idOrInternalId: newReward.free_product_id!,
				orgId: org.id,
				env,
			});

			if (!isFreeProduct(fullProduct.prices)) {
				const isProductOneOff = pricesOnlyOneOff(fullProduct.prices);
				const relevantPrices = isProductOneOff
					? fullProduct.prices
					: fullProduct.prices.filter((price) => isFixedPrice(price));

				await createStripeCoupon({
					reward: newReward,
					org,
					env,
					prices: relevantPrices.map((price) => ({
						...price,
						product: fullProduct,
					})),
					logger,
				});
			}
		}

		const insertedCoupon = await rewardRepo.insert({
			db,
			data: newReward,
		});

		return c.json(insertedCoupon);
	},
});
