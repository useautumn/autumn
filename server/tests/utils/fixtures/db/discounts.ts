import type { ResolvedStripeCoupon } from "@autumn/shared";
import type Stripe from "stripe";

// ═══════════════════════════════════════════════════════════════════
// PERCENT-OFF DISCOUNTS
// ═══════════════════════════════════════════════════════════════════

const percentOff = ({
	percentOff,
	appliesToProducts,
	couponId = "coupon_percent",
}: {
	percentOff: number;
	appliesToProducts?: string[];
	couponId?: string;
}): ResolvedStripeCoupon => ({
	source: {
		coupon: buildCoupon({
			couponId,
			percent_off: percentOff,
			amount_off: null,
			currency: null,
			appliesToProducts,
		}),
	},
});

const tenPercentOff = ({
	appliesToProducts,
	couponId = "coupon_10_percent",
}: {
	appliesToProducts?: string[];
	couponId?: string;
} = {}): ResolvedStripeCoupon =>
	percentOff({ percentOff: 10, appliesToProducts, couponId });

const twentyPercentOff = ({
	appliesToProducts,
	couponId = "coupon_20_percent",
}: {
	appliesToProducts?: string[];
	couponId?: string;
} = {}): ResolvedStripeCoupon =>
	percentOff({ percentOff: 20, appliesToProducts, couponId });

const fiftyPercentOff = ({
	appliesToProducts,
	couponId = "coupon_50_percent",
}: {
	appliesToProducts?: string[];
	couponId?: string;
} = {}): ResolvedStripeCoupon =>
	percentOff({ percentOff: 50, appliesToProducts, couponId });

const hundredPercentOff = ({
	appliesToProducts,
	couponId = "coupon_100_percent",
}: {
	appliesToProducts?: string[];
	couponId?: string;
} = {}): ResolvedStripeCoupon =>
	percentOff({ percentOff: 100, appliesToProducts, couponId });

// ═══════════════════════════════════════════════════════════════════
// AMOUNT-OFF DISCOUNTS
// ═══════════════════════════════════════════════════════════════════

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
}): ResolvedStripeCoupon => ({
	source: {
		coupon: buildCoupon({
			couponId,
			percent_off: null,
			amount_off: amountOffCents,
			currency,
			appliesToProducts,
		}),
	},
});

const fiveDollarsOff = ({
	appliesToProducts,
	couponId = "coupon_5_off",
}: {
	appliesToProducts?: string[];
	couponId?: string;
} = {}): ResolvedStripeCoupon =>
	amountOff({ amountOffCents: 500, appliesToProducts, couponId });

const tenDollarsOff = ({
	appliesToProducts,
	couponId = "coupon_10_off",
}: {
	appliesToProducts?: string[];
	couponId?: string;
} = {}): ResolvedStripeCoupon =>
	amountOff({ amountOffCents: 1000, appliesToProducts, couponId });

const twentyDollarsOff = ({
	appliesToProducts,
	couponId = "coupon_20_off",
}: {
	appliesToProducts?: string[];
	couponId?: string;
} = {}): ResolvedStripeCoupon =>
	amountOff({ amountOffCents: 2000, appliesToProducts, couponId });

const fiftyDollarsOff = ({
	appliesToProducts,
	couponId = "coupon_50_off",
}: {
	appliesToProducts?: string[];
	couponId?: string;
} = {}): ResolvedStripeCoupon =>
	amountOff({ amountOffCents: 5000, appliesToProducts, couponId });

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════

/** Builds a partial Stripe.Coupon with only the fields used by the discount system. */
const buildCoupon = ({
	couponId,
	percent_off,
	amount_off,
	currency,
	appliesToProducts,
}: {
	couponId: string;
	percent_off: number | null;
	amount_off: number | null;
	currency: string | null;
	appliesToProducts?: string[];
}): Stripe.Coupon =>
	({
		id: couponId,
		object: "coupon",
		percent_off,
		amount_off,
		currency,
		applies_to: appliesToProducts ? { products: appliesToProducts } : undefined,
		created: Date.now() / 1000,
		livemode: false,
		valid: true,
	}) as Stripe.Coupon;

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
