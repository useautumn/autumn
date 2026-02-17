import type { StripeDiscountWithCoupon } from "@autumn/shared";

/**
 * Maps internal discount objects to Stripe API `discounts` param format.
 * Uses { promotion_code: id } when the discount originates from a promo code,
 * otherwise uses { coupon: id } for direct coupon references.
 */
export const stripeDiscountsToParams = ({
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
