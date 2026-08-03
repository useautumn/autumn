import {
	type CreateReward,
	ErrCode,
	isFixedPrice,
	RecaseError,
	RewardCategory,
} from "@autumn/shared";
import { createStripeCoupon } from "@/external/stripe/stripeCouponUtils/stripeCouponUtils.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { PriceService } from "@/internal/products/prices/PriceService.js";
import { pricesOnlyOneOff } from "@/internal/products/prices/priceUtils.js";
import { isFreeProduct } from "@/internal/products/productUtils.js";
import { rewardRepo } from "@/internal/rewards/repos/index.js";
import {
	constructReward,
	getRewardCat,
	initRewardStripePrices,
} from "@/internal/rewards/rewardUtils.js";

export const createReward = async ({
	ctx,
	rewardData,
	legacyStripe,
}: {
	ctx: AutumnContext;
	rewardData: CreateReward;
	legacyStripe?: boolean;
}) => {
	const { db, org, env, logger } = ctx;
	const reward = constructReward({
		reward: rewardData,
		orgId: org.id,
		env,
		features: ctx.features,
	});
	const codes = reward.promo_codes.map(({ code }) => code);

	if (new Set(codes).size !== codes.length) {
		throw new RecaseError({
			message: "Promo codes must be unique within a reward",
			code: ErrCode.DuplicatePromoCode,
			statusCode: 400,
		});
	}

	const existingRewards = await rewardRepo.getByIdOrCode({
		db,
		codes: [reward.id, ...codes],
		orgId: org.id,
		env,
	});

	if (existingRewards.some(({ id }) => id === reward.id)) {
		throw new RecaseError({
			message: `Reward with id ${reward.id} already exists`,
			code: ErrCode.DuplicateRewardId,
			statusCode: 400,
		});
	}

	const takenCode = codes.find((code) =>
		existingRewards.some((existingReward) =>
			existingReward.promo_codes.some((promo) => promo.code === code),
		),
	);
	if (takenCode) {
		throw new RecaseError({
			message: `Promo code ${takenCode} is already in use by another reward`,
			code: ErrCode.DuplicatePromoCode,
			statusCode: 400,
		});
	}

	if (getRewardCat(reward) === RewardCategory.Discount) {
		const prices = await PriceService.getInIds({
			db,
			ids: reward.discount_config?.price_ids ?? [],
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

	return rewardRepo.insert({ db, data: reward });
};
