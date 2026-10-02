import type { Reward } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { PriceService } from "@/internal/products/prices/PriceService.js";

/** Coupons store price ids, but the API exposes plan ids — build the lookups getApiCoupon needs */
export const resolveCouponPlanIds = async ({
	db,
	rewards,
}: {
	db: DrizzleCli;
	rewards: Reward[];
}) => {
	const internalProductIdByPriceId = new Map<string, string>();
	const planIdByInternalProductId = new Map<string, string>();

	const priceIds = [
		...new Set(
			rewards
				.filter((reward) => !reward.discount_config?.apply_to_all)
				.flatMap((reward) => reward.discount_config?.price_ids ?? []),
		),
	];

	if (priceIds.length === 0) {
		return { internalProductIdByPriceId, planIdByInternalProductId };
	}

	const prices = await PriceService.getInIds({ db, ids: priceIds });
	for (const price of prices) {
		if (!price.internal_product_id) continue;

		internalProductIdByPriceId.set(price.id, price.internal_product_id);
		if (price.product?.id) {
			planIdByInternalProductId.set(price.internal_product_id, price.product.id);
		}
	}

	return { internalProductIdByPriceId, planIdByInternalProductId };
};
