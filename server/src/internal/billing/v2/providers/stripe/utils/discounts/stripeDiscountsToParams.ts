import type { StripeDiscountWithCoupon } from "@autumn/shared";

/**
 * Maps internal discount objects to Stripe API `discounts` param format for subscription updates.
 * Uses { discount: id } for existing discounts (preserving original start/end),
 * { promotion_code: id } for promo-code-based new discounts,
 * and { coupon: id } for new coupon-based discounts.
 */
export const stripeDiscountsToParams = ({
	stripeDiscounts,
}: {
	stripeDiscounts: StripeDiscountWithCoupon[];
}): (
	| { discount: string }
	| { coupon: string }
	| { promotion_code: string }
)[] => {
	return stripeDiscounts.map((d) => {
		if (d.id) return { discount: d.id };
		if (d.promotionCodeId) return { promotion_code: d.promotionCodeId };
		return { coupon: d.source.coupon.id };
	});
};

/**
 * Maps discount objects to Stripe checkout session `discounts` param format.
 * Checkout sessions only accept { coupon } or { promotion_code } — not { discount }.
 */
export const stripeDiscountsToCheckoutParams = ({
	stripeDiscounts,
}: {
	stripeDiscounts: StripeDiscountWithCoupon[];
}): ({ coupon: string } | { promotion_code: string })[] => {
	return stripeDiscounts.map((d) =>
		d.promotionCodeId
			? { promotion_code: d.promotionCodeId }
			: { coupon: d.source.coupon.id },
	);
};
