import {
	type AppEnv,
	atmnToStripeAmount,
	CouponDurationType,
	ErrCode,
	type FixedPriceConfig,
	getGlobalMaxRedemption,
	type Organization,
	type Price,
	PriceType,
	type Product,
	type Reward,
	RewardType,
	type UsagePriceConfig,
} from "@autumn/shared";
import type Stripe from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { pricesOnlyOneOff } from "@/internal/products/prices/priceUtils.js";
import RecaseError from "@/utils/errorUtils.js";

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
		const currency = org.default_currency || undefined;
		return {
			amount_off: atmnToStripeAmount({
				amount: discountConfig!.discount_value,
				currency,
			}),
			currency,
		};
	}
};

const getStripeProductIdForCoupon = ({
	price,
}: {
	price: Price & { product: Product };
}) => {
	const stripeProductId =
		price.config.type === PriceType.Fixed
			? price.product.processor?.id
			: (price.config as UsagePriceConfig).stripe_product_id;

	if (!stripeProductId) {
		throw new RecaseError({
			message: `Plan ${price.product.id} doesn't exist in Stripe yet. Call attach to generate a checkout URL and it will be created in Stripe automatically.`,
			code: ErrCode.ProductNotInStripe,
			statusCode: 400,
		});
	}

	return stripeProductId;
};

/** Throws product_not_in_stripe for any plan missing in Stripe. Run before deleting an existing coupon. */
export const resolveCouponStripeProductIds = ({
	reward,
	prices,
}: {
	reward: Reward;
	prices: (Price & { product: Product })[];
}) => {
	const appliesToSpecificProducts =
		reward.type !== RewardType.FreeProduct &&
		!reward.discount_config!.apply_to_all;

	return appliesToSpecificProducts
		? prices.map((price) => getStripeProductIdForCoupon({ price }))
		: [];
};

const getPromoCouponId = (promo: Stripe.PromotionCode): string | null => {
	const coupon =
		promo.promotion?.coupon ??
		(promo as unknown as { coupon?: Stripe.Coupon | string }).coupon;
	if (!coupon) return null;
	return typeof coupon === "string" ? coupon : (coupon.id ?? null);
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

	const appliesToSpecificProducts =
		reward.type !== RewardType.FreeProduct && !discountConfig!.apply_to_all;

	// Resolve Stripe product ids before any Stripe writes so a missing
	// plan fails cleanly instead of after the existing coupon is deleted.
	const stripeProdIds = resolveCouponStripeProductIds({ reward, prices });

	const stripeCli = createStripeCli({
		org,
		env,
		legacyVersion,
	});

	const redeemedByCode = new Map<string, number>();
	for (const promoCode of reward.promo_codes) {
		let totalRedeemed = 0;
		for await (const existingPromo of stripeCli.promotionCodes.list({
			code: promoCode.code,
			limit: 100,
		})) {
			const attachedCouponId = getPromoCouponId(existingPromo);
			if (attachedCouponId === reward.id) {
				totalRedeemed += existingPromo.times_redeemed;
			} else if (existingPromo.active) {
				throw new RecaseError({
					message: `Promo code ${promoCode.code} (${existingPromo.id}) already exists in Stripe`,
					code: ErrCode.PromoCodeAlreadyExistsInStripe,
				});
			}
		}
		redeemedByCode.set(promoCode.code, totalRedeemed);
	}

	try {
		await stripeCli.coupons.del(reward.id);
	} catch (_) {}

	// Collect Autumn product IDs for metadata when coupon applies to specific products
	const autumnProductIds = appliesToSpecificProducts
		? [...new Set(prices.map((price) => price.product.id))]
		: [];

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
			...(autumnProductIds.length > 0 && {
				autumn_product_ids: JSON.stringify(autumnProductIds),
			}),
		},
		applies_to: appliesToSpecificProducts
			? {
					products: stripeProdIds,
				}
			: undefined,
	});

	// Create promo codes
	for (const promoCode of reward.promo_codes) {
		const globalMaxRedemption = getGlobalMaxRedemption(promoCode);
		const redeemed = redeemedByCode.get(promoCode.code) ?? 0;
		const maxRedemptions =
			globalMaxRedemption === undefined
				? undefined
				: globalMaxRedemption - redeemed;

		if (maxRedemptions !== undefined && maxRedemptions <= 0) {
			logger.warn(
				`Promo code ${promoCode.code} on reward ${reward.id} has no redemptions remaining (max: ${globalMaxRedemption}, redeemed: ${redeemed}), skipping creation`,
			);
			continue;
		}

		await stripeCli.promotionCodes.create({
			promotion: {
				type: "coupon",
				coupon: stripeCoupon.id,
			},
			code: promoCode.code,
			max_redemptions: maxRedemptions,
			...(promoCode.first_time_transaction
				? { restrictions: { first_time_transaction: true } }
				: {}),
		});
	}
};
