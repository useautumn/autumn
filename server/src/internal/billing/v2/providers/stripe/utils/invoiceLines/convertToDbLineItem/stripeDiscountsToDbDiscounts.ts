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
	discounts,
	currency,
}: {
	discountAmounts: ExpandedDiscountAmount[] | null;
	discounts: Stripe.Discount[];
	currency: string;
}): InvoiceLineItemDiscount[] => {
	if (!discountAmounts) return [];
	const discountsById = new Map(
		discounts.map((discount) => [discount.id, discount]),
	);

	return discountAmounts.map((da) => {
		const discount = discountsById.get(da.discount.id) ?? da.discount;
		const coupon = discount.source?.coupon;

		// Get coupon ID from source.coupon (can be string or expanded Coupon object)
		const couponId = coupon
			? typeof coupon === "string"
				? coupon
				: coupon.id
			: null;
		const percentOff =
			coupon && typeof coupon !== "string"
				? (coupon.percent_off ?? undefined)
				: undefined;

		return {
			amount_off: stripeToAtmnAmount({ amount: da.amount, currency }),
			percent_off: percentOff,
			stripe_discount_id: discount.id,
			stripe_coupon_id: couponId ?? undefined,
		};
	});
};
