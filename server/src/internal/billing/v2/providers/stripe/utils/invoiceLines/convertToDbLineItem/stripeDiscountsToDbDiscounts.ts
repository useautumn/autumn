import {
	type InvoiceLineItemDiscount,
	stripeToAtmnAmount,
} from "@autumn/shared";
import type Stripe from "stripe";

/** Expanded discount amount type (discount is always expanded) */
type ExpandedDiscountAmount = {
	amount: number;
	discount: Stripe.Discount;
};

/**
 * Converts expanded Stripe discount amounts to Autumn DB discount format.
 * Extracts stripe_discount_id and stripe_coupon_id from the expanded discount object.
 */
export const stripeDiscountsToDbDiscounts = ({
	discountAmounts,
	currency,
}: {
	discountAmounts: ExpandedDiscountAmount[] | null;
	currency: string;
}): InvoiceLineItemDiscount[] => {
	if (!discountAmounts) return [];

	return discountAmounts.map((da) => {
		const discount = da.discount;

		// Get coupon ID from source.coupon (can be string or expanded Coupon object)
		const couponId = discount.source?.coupon
			? typeof discount.source.coupon === "string"
				? discount.source.coupon
				: discount.source.coupon.id
			: null;

		return {
			amount_off: stripeToAtmnAmount({ amount: da.amount, currency }),
			percent_off: undefined,
			stripe_discount_id: discount.id,
			stripe_coupon_id: couponId ?? undefined,
		};
	});
};
