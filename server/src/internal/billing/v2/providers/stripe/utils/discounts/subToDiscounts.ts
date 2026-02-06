import { notNullish, type ResolvedStripeCoupon } from "@autumn/shared";
import type Stripe from "stripe";

export const subToDiscounts = ({
	sub,
}: {
	sub?: Stripe.Subscription;
}): ResolvedStripeCoupon[] => {
	if (!sub) return [];

	const discounts = sub.discounts
		.map((discount) => {
			if (typeof discount === "string") return null;

			// Stripe discount has coupon under source.coupon (when expanded)
			const coupon = discount.source?.coupon;
			if (!coupon || typeof coupon === "string") return null;

			return discount as ResolvedStripeCoupon;
		})
		.filter(notNullish);

	return discounts;
};
