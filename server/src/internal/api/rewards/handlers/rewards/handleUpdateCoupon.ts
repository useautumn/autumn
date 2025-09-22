import { ErrCode, PriceType, RewardCategory } from "@autumn/shared";
import { createStripeCoupon } from "@/external/stripe/stripeCouponUtils/stripeCouponUtils.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { PriceService } from "@/internal/products/prices/PriceService.js";
import { RewardService } from "@/internal/rewards/RewardService.js";
import { getRewardCat } from "@/internal/rewards/rewardUtils.js";
import RecaseError from "@/utils/errorUtils.js";
import { routeHandler } from "@/utils/routerUtils.js";

export default async (req: any, res: any) =>
	routeHandler({
		req,
		res,
		action: "update coupon",
		handler: async (req, res) => {
			const { internalId } = req.params;
			const { orgId, env, db, logtail: logger } = req;
			const rewardBody = req.body;

			const org = await OrgService.getFromReq(req);
			const stripeCli = createStripeCli({
				org,
				env,
			});

			const reward = await RewardService.get({
				db,
				idOrInternalId: internalId,
				orgId,
				env,
			});

			if (!reward) {
				throw new RecaseError({
					message: `Reward ${internalId} not found`,
					code: ErrCode.InvalidRequest,
				});
			}

			// Determine prices depending on reward category
			const rewardCat = getRewardCat(rewardBody);

			let prices: any[] = [];
			if (rewardCat === RewardCategory.Discount) {
				const stripePriceIds =
					rewardBody.discount_config?.price_ids ??
					reward.discount_config?.price_ids ??
					[];
				const byStripeId = await PriceService.getByStripeIds({
					db,
					stripePriceIds,
				});
				prices = stripePriceIds
					.map((id: string) => byStripeId[id])
					.filter(Boolean);
			} else if (rewardCat === RewardCategory.FreeProduct) {
				const freeProductId =
					rewardBody.free_product_id ?? reward.free_product_id;
				if (freeProductId) {
					const fullProduct = await ProductService.getFull({
						db,
						idOrInternalId: freeProductId,
						orgId: org.id,
						env,
					});
					prices = fullProduct.prices
						.map((price) => ({
							...price,
							product: fullProduct,
						}))
						.filter((x) => x.config?.type === PriceType.Fixed);
				}
			}

			// 1. Delete old prices from stripe
			try {
				await stripeCli.coupons.del(reward.id);
				await stripeCli.coupons.del(reward.internal_id);
			} catch (_) {
				// console.log(`Failed to delete coupon from stripe: ${error.message}`);
			}

			if (
				rewardCat === RewardCategory.Discount ||
				(rewardCat === RewardCategory.FreeProduct && prices.length > 0)
			) {
				await createStripeCoupon({
					reward: rewardBody,
					org,
					env,
					prices,
					logger,
					legacyVersion: req.query.legacyStripe === "true",
				});
			}

			// 3. Update coupon in db
			const updatedCoupon = await RewardService.update({
				db,
				internalId: reward.internal_id,
				env,
				orgId,
				update: rewardBody,
			});

			res.status(200).json(updatedCoupon);
		},
	});
