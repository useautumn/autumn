import {
	type InvoiceLineItemDiscount,
	stripeRefToId,
	stripeToAtmnAmount,
} from "@autumn/shared";
import type Stripe from "stripe";

type ExpandedDiscountAmount = {
	amount: number;
	discount: Stripe.Discount;
};

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

		const couponId = coupon ? stripeRefToId(coupon) : null;
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
