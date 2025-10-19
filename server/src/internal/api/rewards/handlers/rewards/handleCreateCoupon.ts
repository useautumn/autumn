import {
	CreateRewardSchema,
	isFixedPrice,
	RewardCategory,
} from "@autumn/shared";
import { createStripeCoupon } from "@/external/stripe/stripeCouponUtils/stripeCouponUtils.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
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
import { routeHandler } from "@/utils/routerUtils.js";

export default async (req: any, res: any) =>
	routeHandler({
		req,
		res,
		action: "create coupon",
		handler: async (req, res) => {
			const { db, orgId, env, logger } = req;
			const rewardBody = req.body;
			const rewardData = CreateRewardSchema.parse(rewardBody);

			const org = await OrgService.getFromReq(req);

			const newReward = constructReward({
				reward: rewardData,
				orgId,
				env,
			});

			if (getRewardCat(newReward) === RewardCategory.Discount) {
				const discountConfig = newReward.discount_config;

				// Get prices for coupon
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
					legacyVersion: req.query.legacyStripe === "true",
				});
			}

			if (getRewardCat(newReward) === RewardCategory.FreeProduct) {
				// 1. Check if product is paid
				const fullProduct = await ProductService.getFull({
					db,
					idOrInternalId: newReward.free_product_id!,
					orgId: org.id,
					env,
				});

				if (!isFreeProduct(fullProduct.prices)) {
					// For one-off products, include all prices; for recurring products, only fixed prices
					const isProductOneOff = pricesOnlyOneOff(fullProduct.prices);
					const relevantPrices = isProductOneOff
						? fullProduct.prices // Include all prices for one-off products
						: fullProduct.prices.filter((price) => isFixedPrice({ price })); // Only fixed prices for recurring products

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

			res.status(200).json(insertedCoupon);
		},
	});
