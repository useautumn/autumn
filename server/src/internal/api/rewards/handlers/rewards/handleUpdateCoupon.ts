import { ErrCode, notNullish, RewardCategory } from "@autumn/shared";
import { createStripeCoupon } from "@/external/stripe/stripeCouponUtils/stripeCouponUtils.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
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

			const prices = await PriceService.getInIds({
				db,
				ids: notNullish(rewardBody.price_ids)
					? rewardBody.price_ids
					: reward.discount_config?.price_ids,
			});

			// 1. Delete old prices from stripe
			try {
				await stripeCli.coupons.del(reward.id);
				await stripeCli.coupons.del(reward.internal_id);
			} catch (_) {
				// console.log(`Failed to delete coupon from stripe: ${error.message}`);
			}

			const rewardCat = getRewardCat(rewardBody);
			if (rewardCat === RewardCategory.Discount) {
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