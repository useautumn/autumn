import type { StripeDiscountWithCoupon } from "@autumn/shared";

// ═══════════════════════════════════════════════════════════════════
// PERCENT-OFF DISCOUNTS
// ═══════════════════════════════════════════════════════════════════

/**
 * Create a percent-off discount
 * @param percentOff - Percentage discount (e.g., 20 for 20%)
 * @param appliesToProducts - Optional list of Stripe product IDs this discount applies to
 * @param couponId - Optional coupon ID (default: "coupon_percent")
 */
const percentOff = ({
	percentOff,
	appliesToProducts,
	couponId = "coupon_percent",
}: {
	percentOff: number;
	appliesToProducts?: string[];
	couponId?: string;
}): StripeDiscountWithCoupon =>
	({
		id: `di_${couponId}`,
		object: "discount",
		coupon: {} as StripeDiscountWithCoupon["coupon"],
		start: Date.now() / 1000,
		source: {
			coupon: {
				id: couponId,
				object: "coupon",
				percent_off: percentOff,
				amount_off: null,
				currency: null,
				applies_to: appliesToProducts
					? { products: appliesToProducts }
					: undefined,
				created: Date.now() / 1000,
				livemode: false,
				valid: true,
			},
		},
	}) as StripeDiscountWithCoupon;

/**
 * 10% off discount
 */
const tenPercentOff = ({
	appliesToProducts,
	couponId = "coupon_10_percent",
}: {
	appliesToProducts?: string[];
	couponId?: string;
} = {}): StripeDiscountWithCoupon =>
	percentOff({ percentOff: 10, appliesToProducts, couponId });

/**
 * 20% off discount
 */
const twentyPercentOff = ({
	appliesToProducts,
	couponId = "coupon_20_percent",
}: {
	appliesToProducts?: string[];
	couponId?: string;
} = {}): StripeDiscountWithCoupon =>
	percentOff({ percentOff: 20, appliesToProducts, couponId });

/**
 * 50% off discount
 */
const fiftyPercentOff = ({
	appliesToProducts,
	couponId = "coupon_50_percent",
}: {
	appliesToProducts?: string[];
	couponId?: string;
} = {}): StripeDiscountWithCoupon =>
	percentOff({ percentOff: 50, appliesToProducts, couponId });

/**
 * 100% off discount (free)
 */
const hundredPercentOff = ({
	appliesToProducts,
	couponId = "coupon_100_percent",
}: {
	appliesToProducts?: string[];
	couponId?: string;
} = {}): StripeDiscountWithCoupon =>
	percentOff({ percentOff: 100, appliesToProducts, couponId });

// ═══════════════════════════════════════════════════════════════════
// AMOUNT-OFF DISCOUNTS
// ═══════════════════════════════════════════════════════════════════

/**
 * Create an amount-off discount
 * @param amountOffCents - Amount off in Stripe cents (e.g., 1000 for $10)
 * @param currency - Currency code (default: "usd")
 * @param appliesToProducts - Optional list of Stripe product IDs this discount applies to
 * @param couponId - Optional coupon ID (default: "coupon_amount")
 */
const amountOff = ({
	amountOffCents,
	currency = "usd",
	appliesToProducts,
	couponId = "coupon_amount",
}: {
	amountOffCents: number;
	currency?: string;
	appliesToProducts?: string[];
	couponId?: string;
}): StripeDiscountWithCoupon =>
	({
		id: `di_${couponId}`,
		object: "discount",
		coupon: {} as StripeDiscountWithCoupon["coupon"],
		start: Date.now() / 1000,
		source: {
			coupon: {
				id: couponId,
				object: "coupon",
				percent_off: null,
				amount_off: amountOffCents,
				currency,
				applies_to: appliesToProducts
					? { products: appliesToProducts }
					: undefined,
				created: Date.now() / 1000,
				livemode: false,
				valid: true,
			},
		},
	}) as StripeDiscountWithCoupon;

/**
 * $5 off discount (500 cents)
 */
const fiveDollarsOff = ({
	appliesToProducts,
	couponId = "coupon_5_off",
}: {
	appliesToProducts?: string[];
	couponId?: string;
} = {}): StripeDiscountWithCoupon =>
	amountOff({ amountOffCents: 500, appliesToProducts, couponId });

/**
 * $10 off discount (1000 cents)
 */
const tenDollarsOff = ({
	appliesToProducts,
	couponId = "coupon_10_off",
}: {
	appliesToProducts?: string[];
	couponId?: string;
} = {}): StripeDiscountWithCoupon =>
	amountOff({ amountOffCents: 1000, appliesToProducts, couponId });

/**
 * $20 off discount (2000 cents)
 */
const twentyDollarsOff = ({
	appliesToProducts,
	couponId = "coupon_20_off",
}: {
	appliesToProducts?: string[];
	couponId?: string;
} = {}): StripeDiscountWithCoupon =>
	amountOff({ amountOffCents: 2000, appliesToProducts, couponId });

/**
 * $50 off discount (5000 cents)
 */
const fiftyDollarsOff = ({
	appliesToProducts,
	couponId = "coupon_50_off",
}: {
	appliesToProducts?: string[];
	couponId?: string;
} = {}): StripeDiscountWithCoupon =>
	amountOff({ amountOffCents: 5000, appliesToProducts, couponId });

// ═══════════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════════

export const discounts = {
	// Generic builders
	percentOff,
	amountOff,

	// Percent-off presets
	tenPercentOff,
	twentyPercentOff,
	fiftyPercentOff,
	hundredPercentOff,

	// Amount-off presets
	fiveDollarsOff,
	tenDollarsOff,
	twentyDollarsOff,
	fiftyDollarsOff,
} as const;
