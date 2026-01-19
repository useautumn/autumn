import {
	ErrCode,
	type Price,
	PriceType,
	type Product,
	RecaseError,
	RewardCategory,
} from "@autumn/shared";
import { z } from "zod/v4";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { createStripeCoupon } from "@/external/stripe/stripeCouponUtils/stripeCouponUtils.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { PriceService } from "@/internal/products/prices/PriceService.js";
import { RewardService } from "@/internal/rewards/RewardService.js";
import { getRewardCat } from "@/internal/rewards/rewardUtils.js";

const UpdateCouponParamsSchema = z.object({
	internalId: z.string(),
});

const UpdateCouponQuerySchema = z.object({
	legacyStripe: z.string().optional(),
});

export const handleUpdateCoupon = createRoute({
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

		const reward = await RewardService.get({
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

		// Delete old prices from stripe
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
				legacyVersion: legacyStripe === "true",
			});
		}

		const updatedCoupon = await RewardService.update({
			db,
			internalId: reward.internal_id,
			env,
			orgId: org.id,
			update: rewardBody,
		});

		return c.json(updatedCoupon);
	},
});
