import {
	isFixedPrice,
	type Price,
	type Product,
	type Reward,
	RewardCategory,
} from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { createStripeCoupon } from "@/external/stripe/stripeCouponUtils/stripeCouponUtils.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { getRewardCat } from "@/internal/rewards/rewardUtils.js";
import { getRewardPrices } from "./getRewardPrices.js";

const getCouponPrices = async ({
	ctx,
	reward,
}: {
	ctx: AutumnContext;
	reward: Reward;
}): Promise<(Price & { product: Product })[]> => {
	if (getRewardCat(reward) === RewardCategory.Discount) {
		return getRewardPrices({
			ctx,
			priceIds: reward.discount_config?.price_ids ?? [],
		});
	}
	if (!reward.free_product_id) return [];

	const product = await ProductService.getFull({
		db: ctx.db,
		idOrInternalId: reward.free_product_id,
		orgId: ctx.org.id,
		env: ctx.env,
	});
	return product.prices
		.filter(isFixedPrice)
		.map((price) => ({ ...price, product }));
};

/** Recreates a reward's Stripe coupon after its replacement failed, since both share reward.id. */
export const restoreStripeCoupon = async ({
	ctx,
	reward,
	replacementId,
	legacyStripe,
}: {
	ctx: AutumnContext;
	reward: Reward;
	replacementId: string;
	legacyStripe?: boolean;
}) => {
	const stripeCli = createStripeCli({
		org: ctx.org,
		env: ctx.env,
		legacyVersion: legacyStripe,
	});
	await stripeCli.coupons.del(replacementId).catch(() => {});

	const prices = await getCouponPrices({ ctx, reward });
	const hadStripeCoupon =
		getRewardCat(reward) === RewardCategory.Discount || prices.length > 0;
	if (!hadStripeCoupon) return;

	await createStripeCoupon({
		reward,
		org: ctx.org,
		env: ctx.env,
		prices,
		logger: ctx.logger,
		legacyVersion: legacyStripe,
	});
};
