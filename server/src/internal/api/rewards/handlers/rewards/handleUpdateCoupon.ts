import {
	ErrCode,
	normalizePromoCodes,
	type Price,
	PriceType,
	type Product,
	RecaseError,
	RewardCategory,
	Scopes,
} from "@autumn/shared";
import { z } from "zod/v4";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import {
	createStripeCoupon,
	resolveCouponStripeProductIds,
} from "@/external/stripe/stripeCouponUtils/stripeCouponUtils.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { PriceService } from "@/internal/products/prices/PriceService.js";
import { rewardRepo } from "@/internal/rewards/repos/index.js";
import { getRewardCat } from "@/internal/rewards/rewardUtils.js";

const UpdateCouponParamsSchema = z.object({
	internalId: z.string(),
});

const UpdateCouponQuerySchema = z.object({
	legacyStripe: z.boolean().optional(),
});

export const handleUpdateCoupon = createRoute({
	scopes: [Scopes.Rewards.Write],
	params: UpdateCouponParamsSchema,
	query: UpdateCouponQuerySchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { org, env, db, logger } = ctx;
		const { internalId } = c.req.param();
		const { legacyStripe } = c.req.valid("query");
		const rewardBody = await c.req.json();

		const stripeCli = createStripeCli({
			org,
			env,
		});

		const reward = await rewardRepo.get({
			db,
			idOrInternalId: internalId,
			orgId: org.id,
			env,
		});

		if (!reward) {
			throw new RecaseError({
				message: `Reward ${internalId} not found`,
				code: ErrCode.InvalidRequest,
				statusCode: 404,
			});
		}

		rewardBody.promo_codes = normalizePromoCodes(
			rewardBody.promo_codes ?? reward.promo_codes ?? [],
		);

		const rewardCat = getRewardCat(rewardBody);

		let prices: (Price & { product: Product })[] = [];
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

		const willRecreateStripeCoupon =
			rewardCat === RewardCategory.Discount ||
			(rewardCat === RewardCategory.FreeProduct && prices.length > 0);

		// Preflight before deleting the old Stripe coupon, so a plan missing
		// in Stripe fails the update while the existing coupon is still intact.
		if (willRecreateStripeCoupon) {
			resolveCouponStripeProductIds({ reward: rewardBody, prices });
		}

		// Delete old prices from stripe
		try {
			await stripeCli.coupons.del(reward.id);
			await stripeCli.coupons.del(reward.internal_id);
		} catch (_) {}

		if (willRecreateStripeCoupon) {
			await createStripeCoupon({
				reward: rewardBody,
				org,
				env,
				prices,
				logger,
				legacyVersion: legacyStripe,
			});
		}

		const updatedCoupon = await rewardRepo.update({
			db,
			internalId: reward.internal_id,
			env,
			orgId: org.id,
			update: rewardBody,
		});

		return c.json(updatedCoupon);
	},
});
