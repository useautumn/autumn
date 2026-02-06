import type { ResolvedStripeCoupon } from "@autumn/shared";

/** Maps internal discount objects to Stripe API `discounts` param format. */
export const stripeDiscountsToParams = ({
	stripeDiscounts,
}: {
	stripeDiscounts: ResolvedStripeCoupon[];
}): { coupon: string }[] => {
	return stripeDiscounts.map((d) => ({ coupon: d.source.coupon.id }));
};
