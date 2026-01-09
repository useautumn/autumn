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
 * Only applies to charge items (not refunds) - distributes proportionally across charges.
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

	// Filter to applicable CHARGE line items only
	// Discounts reduce what the customer pays, so only apply to charges
	const applicableChargeItems = lineItems.filter(
		(item) => discountAppliesToLineItem({ discount, lineItem: item }),
	);

	if (applicableChargeItems.length === 0) return lineItems;

	// Build a map of line item -> discount amount
	const discountMap = new Map<LineItem, number>();

	// Distribute discount proportionally across charge items
	const total = applicableChargeItems.reduce(
		(sum, item) => sum + Math.abs(item.amount),
		0,
	);

	if (total === 0) return lineItems;

	for (const item of applicableChargeItems) {
		const proportion = new Decimal(Math.abs(item.amount)).dividedBy(total);
		const itemDiscount = proportion.times(discountAmountOff).round().toNumber();
		discountMap.set(item, itemDiscount);
	}

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

		// Discounts only apply to charges (refunds filtered by discountAppliesToLineItem)
		// Cap at 0 to prevent negative charges
		const finalAmount = Math.max(
			new Decimal(item.amount).minus(totalDiscount).toNumber(),
			0,
		);

		return {
			...item,
			discounts: [...existingDiscounts, newDiscount],
			finalAmount,
		};
	});
};
