import {
	isFixedPrice,
	type Price,
	type Product,
	type Reward,
	RewardCategory,
} from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import {
	createStripeCoupon,
	resolveCouponStripeProductIds,
} from "@/external/stripe/stripeCouponUtils/stripeCouponUtils.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";
import {
	getRewardCat,
	initRewardStripePrices,
} from "@/internal/rewards/rewardUtils.js";
import { getRewardPrices } from "./getRewardPrices.js";
import { validateCouponStripeProductScope } from "./validateCouponStripeProductScope.js";

type CouponPrice = Price & { product: Product };

const rewardHasStripeCoupon = ({
	reward,
	prices,
}: {
	reward: Reward;
	prices: CouponPrice[];
}) => getRewardCat(reward) === RewardCategory.Discount || prices.length > 0;

const getCouponPrices = async ({
	ctx,
	reward,
}: {
	ctx: AutumnContext;
	reward: Reward;
}): Promise<CouponPrice[]> => {
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

const preflightStripeCoupon = async ({
	ctx,
	reward,
	prices,
}: {
	ctx: AutumnContext;
	reward: Reward;
	prices: CouponPrice[];
}) => {
	await initRewardStripePrices({ ctx, prices });
	await validateCouponStripeProductScope({ ctx, reward, prices });
	resolveCouponStripeProductIds({ reward, prices });
};

const deleteStripeCoupons = async ({
	ctx,
	reward,
}: {
	ctx: AutumnContext;
	reward: Reward;
}) => {
	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
	try {
		await stripeCli.coupons.del(reward.id);
		await stripeCli.coupons.del(reward.internal_id);
	} catch (_) {}
};

const restoreStripeCoupon = async ({
	ctx,
	reward,
	legacyStripe,
}: {
	ctx: AutumnContext;
	reward: Reward;
	legacyStripe?: boolean;
}) => {
	const prices = await getCouponPrices({ ctx, reward });
	if (!rewardHasStripeCoupon({ reward, prices })) return;

	await createStripeCoupon({
		reward,
		org: ctx.org,
		env: ctx.env,
		prices,
		logger: ctx.logger,
		legacyVersion: legacyStripe,
	});
};

/** Stripe can't edit coupons and the id is fixed, so the old coupon is deleted, recreated, and restored if that fails. */
export const replaceStripeCoupon = async ({
	ctx,
	reward,
	updatedReward,
	prices,
	legacyStripe,
}: {
	ctx: AutumnContext;
	reward: Reward;
	updatedReward: Reward;
	prices: CouponPrice[];
	legacyStripe?: boolean;
}) => {
	const createsCoupon = rewardHasStripeCoupon({
		reward: updatedReward,
		prices,
	});
	if (createsCoupon) {
		await preflightStripeCoupon({ ctx, reward: updatedReward, prices });
	}

	await deleteStripeCoupons({ ctx, reward });
	if (!createsCoupon) return;

	try {
		await createStripeCoupon({
			reward: updatedReward,
			org: ctx.org,
			env: ctx.env,
			prices,
			logger: ctx.logger,
			legacyVersion: legacyStripe,
		});
	} catch (error) {
		await restoreStripeCoupon({ ctx, reward, legacyStripe });
		throw error;
	}
};
