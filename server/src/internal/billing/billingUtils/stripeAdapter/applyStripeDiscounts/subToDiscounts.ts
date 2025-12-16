import { notNullish } from "@autumn/shared";
import type Stripe from "stripe";

export const subToDiscounts = ({
	sub,
}: {
	sub?: Stripe.Subscription;
}): (Stripe.Discount & { source: { coupon: Stripe.Coupon } })[] => {
	if (!sub) return [];

	const discounts = sub.discounts
		.map((discount) => (typeof discount === "string" ? null : discount))
		.filter(notNullish) as (Stripe.Discount & {
		source: { coupon: Stripe.Coupon };
	})[];

	return discounts;
};
