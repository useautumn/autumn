import { ErrCode, PriceType, RewardCategory } from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { createStripeCoupon } from "@/external/stripe/stripeCouponUtils/stripeCouponUtils.js";
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
			const { orgId, env, db, logger } = req;
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
				const priceIds =
					rewardBody.discount_config?.price_ids ??
					reward.discount_config?.price_ids ??
					[];

				prices = await PriceService.getInIds({
					db,
					ids: priceIds,
				});
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
			} catch (_) {}

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
