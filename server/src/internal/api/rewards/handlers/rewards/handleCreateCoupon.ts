import {
	CreateRewardSchema,
	isFixedPrice,
	RewardCategory,
} from "@autumn/shared";
import { z } from "zod/v4";
import { createStripeCoupon } from "@/external/stripe/stripeCouponUtils/stripeCouponUtils.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { PriceService } from "@/internal/products/prices/PriceService.js";
import { pricesOnlyOneOff } from "@/internal/products/prices/priceUtils.js";
import { isFreeProduct } from "@/internal/products/productUtils.js";
import { RewardService } from "@/internal/rewards/RewardService.js";
import {
	constructReward,
	getRewardCat,
	initRewardStripePrices,
} from "@/internal/rewards/rewardUtils.js";

const CreateCouponQuerySchema = z.object({
	legacyStripe: z.string().optional(),
});

export const handleCreateCoupon = createRoute({
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
		});

		if (getRewardCat(newReward) === RewardCategory.Discount) {
			const discountConfig = newReward.discount_config;

			const [prices] = await Promise.all([
				PriceService.getInIds({
					db,
					ids: discountConfig!.price_ids || [],
				}),
			]);

			await initRewardStripePrices({
				db,
				prices,
				org,
				env,
				logger,
			});

			await createStripeCoupon({
				reward: newReward,
				org,
				env,
				prices,
				logger,
				legacyVersion: legacyStripe === "true",
			});
		}

		if (getRewardCat(newReward) === RewardCategory.FreeProduct) {
			const fullProduct = await ProductService.getFull({
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

		const insertedCoupon = await RewardService.insert({
			db,
			data: newReward,
		});

		return c.json(insertedCoupon);
	},
});
