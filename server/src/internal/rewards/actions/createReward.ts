import {
	type CreateReward,
	isFixedPrice,
	RewardCategory,
} from "@autumn/shared";
import { createStripeCoupon } from "@/external/stripe/stripeCouponUtils/stripeCouponUtils.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { pricesOnlyOneOff } from "@/internal/products/prices/priceUtils.js";
import { isFreeProduct } from "@/internal/products/productUtils.js";
import { rewardRepo } from "@/internal/rewards/repos/index.js";
import {
	constructReward,
	getRewardCat,
	initRewardStripePrices,
} from "@/internal/rewards/rewardUtils.js";
import { getRewardPrices } from "./getRewardPrices.js";
import { validateRewardUniqueness } from "./validateRewardUniqueness.js";

type CreateRewardParams = {
	ctx: AutumnContext;
	rewardData: CreateReward;
	legacyStripe?: boolean;
};

export const createReward = async ({
	ctx,
	rewardData,
	legacyStripe,
}: CreateRewardParams) => {
	const { db, org, env, logger } = ctx;
	const reward = constructReward({
		reward: rewardData,
		orgId: org.id,
		env,
		features: ctx.features,
	});
	await validateRewardUniqueness({
		db,
		reward,
		orgId: org.id,
		env,
	});

	if (getRewardCat(reward) === RewardCategory.Discount) {
		const prices = await getRewardPrices({
			ctx,
			priceIds: reward.discount_config?.price_ids ?? [],
		});
		await initRewardStripePrices({ ctx, prices });
		await createStripeCoupon({
			reward,
			org,
			env,
			prices,
			logger,
			legacyVersion: legacyStripe,
		});
	}

	if (
		getRewardCat(reward) === RewardCategory.FreeProduct &&
		reward.free_product_id
	) {
		const product = await ProductService.getFull({
			db,
			idOrInternalId: reward.free_product_id,
			orgId: org.id,
			env,
		});

		if (!isFreeProduct(product.prices)) {
			const prices = pricesOnlyOneOff(product.prices)
				? product.prices
				: product.prices.filter(isFixedPrice);
			await createStripeCoupon({
				reward,
				org,
				env,
				prices: prices.map((price) => ({ ...price, product })),
				logger,
			});
		}
	}

	return rewardRepo.insert({ db, data: reward, features: ctx.features });
};
