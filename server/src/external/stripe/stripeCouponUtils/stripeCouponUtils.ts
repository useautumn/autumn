import {
	type AppEnv,
	CouponDurationType,
	ErrCode,
	type FixedPriceConfig,
	type Organization,
	type Price,
	PriceType,
	type Product,
	type Reward,
	RewardType,
	type UsagePriceConfig,
	atmnToStripeAmount,
} from "@autumn/shared";
import { pricesOnlyOneOff } from "@/internal/products/prices/priceUtils.js";
import RecaseError from "@/utils/errorUtils.js";
import { createStripeCli } from "../utils.js";

const couponToStripeDuration = ({
	coupon,
	isOneOffProduct = false,
}: {
	coupon: Reward;
	isOneOffProduct: boolean;
}) => {
	if (coupon.type === RewardType.FreeProduct) {
		// For one-off products, the coupon should apply once, not repeat
		if (isOneOffProduct) {
			return {
				duration: "once",
			};
		}
		console.log("--------------------------------");
		console.log("rewardName", coupon.name);
		console.log("coupon.free_product_config", coupon.free_product_config);
		console.log("isOneOffProduct", isOneOffProduct);
		console.log("--------------------------------");
		return {
			duration: "repeating",
			duration_in_months: coupon.free_product_config?.duration_value,
		};
	}

	const discountConfig = coupon.discount_config;
	if (
		coupon.type === RewardType.InvoiceCredits &&
		coupon.discount_config?.duration_type === CouponDurationType.Forever
	) {
		return {
			duration: "once",
		};
	}

	// For one-off products, always use "once" duration regardless of config
	if (isOneOffProduct) {
		return {
			duration: "once",
		};
	}

	switch (discountConfig!.duration_type) {
		case CouponDurationType.Forever:
			return {
				duration: "forever",
			};
		case CouponDurationType.OneOff:
			return {
				duration: "once",
			};
		case CouponDurationType.Months:
			return {
				duration: "repeating",
				duration_in_months: discountConfig!.duration_value,
			};
	}
};

const couponToStripeValue = ({
	reward,
	org,
	prices,
}: {
	reward: Reward;
	org: Organization;
	prices?: (Price & { product: Product })[];
}) => {
	if (reward.type === RewardType.FreeProduct) {
		const amountOff = Math.round(
			prices?.reduce(
				(acc, price) => acc + (price.config as FixedPriceConfig).amount,
				0,
			) || 0,
		);

		console.log("amountOff in couponToStripeValue", amountOff);
		const currency = org.default_currency || "usd";
		return {
			amount_off: atmnToStripeAmount({ amount: amountOff, currency }),
			currency,
		};
	}

	const discountConfig = reward.discount_config;
	if (reward.type === RewardType.PercentageDiscount) {
		return {
			percent_off: discountConfig!.discount_value,
		};
	} else if (
		reward.type === RewardType.FixedDiscount ||
		reward.type === RewardType.InvoiceCredits
	) {
		const currency = org.default_currency;
		return {
			amount_off: atmnToStripeAmount({
				amount: discountConfig!.discount_value,
				currency,
			}),
			currency,
		};
	}
};

export const createStripeCoupon = async ({
	reward,
	org,
	env,
	prices,
	logger,
	legacyVersion,
}: {
	reward: Reward;
	org: Organization;
	env: AppEnv;
	prices: (Price & { product: Product })[];
	logger: any;
	legacyVersion?: boolean;
}) => {
	const discountConfig = reward.discount_config;

	const stripeCli = createStripeCli({
		org,
		env,
		legacyVersion,
	});

	try {
		await stripeCli.coupons.del(reward.id);
	} catch (_) {}

	const stripeProdIds = prices.map((price) => {
		if (price.config!.type === PriceType.Fixed) {
			return price.product.processor?.id;
		} else {
			const config = price.config as UsagePriceConfig;
			if (!config.stripe_product_id) {
				logger.warn("No stripe product id for price", { price });
				logger.warn("Config", { config });
				throw new RecaseError({
					message: `No stripe product id for price ${price.id}`,
					code: ErrCode.InternalError,
				});
			}

			return config.stripe_product_id;
		}
	});

	for (const promoCode of reward.promo_codes) {
		try {
			const stripePromoCode = await stripeCli.promotionCodes.retrieve(
				promoCode.code,
			);
			throw new RecaseError({
				message: `Promo code ${promoCode.code} (${stripePromoCode.id}) already exists in Stripe`,
				code: ErrCode.PromoCodeAlreadyExistsInStripe,
			});
		} catch (_) {}
	}

	const stripeCoupon = await stripeCli.coupons.create({
		// id: reward.internal_id,
		id: reward.id,
		...(couponToStripeDuration({
			coupon: reward,
			isOneOffProduct: pricesOnlyOneOff(prices),
		}) as any),
		...(couponToStripeValue({ reward, org, prices }) as any),
		name: reward.name,
		metadata: {
			autumn_internal_id: reward.internal_id,
		},
		applies_to:
			reward.type === RewardType.FreeProduct
				? undefined
				: !discountConfig!.apply_to_all
					? {
							products: stripeProdIds,
						}
					: undefined,
	});

	// Create promo codes
	for (const promoCode of reward.promo_codes) {
		await stripeCli.promotionCodes.create({
			coupon: stripeCoupon.id,
			code: promoCode.code,
		});
	}
};
