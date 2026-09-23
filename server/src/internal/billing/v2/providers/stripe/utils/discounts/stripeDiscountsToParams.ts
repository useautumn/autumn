import type { StripeDiscountWithCoupon } from "@autumn/shared";
import type Stripe from "stripe";

const orderStripeDiscounts = (
	stripeDiscounts: StripeDiscountWithCoupon[],
): StripeDiscountWithCoupon[] =>
	[...stripeDiscounts].sort((a, b) => {
		const aIsPercent = a.source.coupon.percent_off != null;
		const bIsPercent = b.source.coupon.percent_off != null;
		return Number(bIsPercent) - Number(aIsPercent);
	});

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
	return orderStripeDiscounts(stripeDiscounts).map((d) => {
		if (d.id) return { discount: d.id };
		if (d.promotionCodeId) return { promotion_code: d.promotionCodeId };
		return { coupon: d.source.coupon.id };
	});
};

/**
 * `discounts` for a subscription update: undefined leaves Stripe untouched, and
 * "" unsets it once every expanded discount on the subscription was removed.
 */
export const stripeDiscountsToSubscriptionUpdateParam = ({
	stripeSubscription,
	stripeDiscounts,
}: {
	stripeSubscription: Stripe.Subscription;
	stripeDiscounts?: StripeDiscountWithCoupon[];
}): ReturnType<typeof stripeDiscountsToParams> | "" | undefined => {
	if (stripeDiscounts?.length)
		return stripeDiscountsToParams({ stripeDiscounts });

	// Unexpanded discount ids never reached stripeDiscounts, so they can't signal a removal.
	const hadExpandedDiscounts = (stripeSubscription.discounts ?? []).some(
		(discount) => typeof discount !== "string",
	);
	return stripeDiscounts && hadExpandedDiscounts ? "" : undefined;
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
	return orderStripeDiscounts(stripeDiscounts).map((d) =>
		d.promotionCodeId
			? { promotion_code: d.promotionCodeId }
			: { coupon: d.source.coupon.id },
	);
};
