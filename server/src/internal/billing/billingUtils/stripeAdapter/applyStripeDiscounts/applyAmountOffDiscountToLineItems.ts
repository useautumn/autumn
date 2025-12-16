import {
	type LineItem,
	type LineItemDiscount,
	type StripeDiscountWithCoupon,
	stripeToAtmnAmount,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import { discountAppliesToLineItem } from "./discountAppliesToLineItem";

/**
 * Applies an amount_off discount to line items.
 * Distributes the fixed amount proportionally within each direction group (refund/charge).
 */
export const applyAmountOffDiscountToLineItems = ({
	lineItems,
	discount,
}: {
	lineItems: LineItem[];
	discount: StripeDiscountWithCoupon;
}): LineItem[] => {
	const coupon = discount.source.coupon;
	const amountOffCents = coupon.amount_off;

	if (!amountOffCents || amountOffCents === 0) {
		return lineItems;
	}

	// Convert from Stripe cents to Autumn dollars
	const discountAmountOff = stripeToAtmnAmount({
		amount: amountOffCents,
		currency: coupon.currency ?? "usd",
	});

	// Filter to applicable line items
	const applicableItems = lineItems.filter((item) =>
		discountAppliesToLineItem({ discount, lineItem: item }),
	);

	if (applicableItems.length === 0) return lineItems;

	// Build a map of line item -> discount amount
	const discountMap = new Map<LineItem, number>();

	// Helper to distribute discount proportionally across items
	const distributeDiscount = (items: LineItem[]) => {
		const total = items.reduce((sum, item) => sum + Math.abs(item.amount), 0);

		if (total === 0) return;

		for (const item of items) {
			const proportion = new Decimal(Math.abs(item.amount)).dividedBy(total);
			const itemDiscount = proportion
				.times(discountAmountOff)
				.round()
				.toNumber();
			discountMap.set(item, itemDiscount);
		}
	};

	// Group by direction and distribute separately
	const refundItems = applicableItems.filter(
		(item) => item.context.direction === "refund",
	);
	const chargeItems = applicableItems.filter(
		(item) => item.context.direction === "charge",
	);

	distributeDiscount(refundItems);
	distributeDiscount(chargeItems);

	// Apply discounts to line items
	return lineItems.map((item) => {
		const itemDiscount = discountMap.get(item);

		if (!itemDiscount || itemDiscount === 0) return item;

		const newDiscount: LineItemDiscount = {
			amountOff: itemDiscount,
			stripeCouponId: coupon.id,
		};

		const existingDiscounts = item.discounts ?? [];
		const totalDiscount =
			existingDiscounts.reduce((sum, d) => sum + d.amountOff, 0) + itemDiscount;

		// Calculate finalAmount based on direction
		// Refund (negative): add discount to make less negative
		// Charge (positive): subtract discount to reduce charge
		const finalAmount =
			item.context.direction === "refund"
				? new Decimal(item.amount).plus(totalDiscount).toNumber()
				: new Decimal(item.amount).minus(totalDiscount).toNumber();

		return {
			...item,
			discounts: [...existingDiscounts, newDiscount],
			finalAmount,
		};
	});
};
