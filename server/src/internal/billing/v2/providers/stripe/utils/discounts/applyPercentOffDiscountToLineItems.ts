import type {
	LineItem,
	LineItemDiscount,
	StripeDiscountWithCoupon,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import { discountAppliesToLineItem } from "./discountAppliesToLineItem";

/**
 * Applies a percent_off discount to line items.
 * Applies the percentage to each applicable line item individually.
 */
export const applyPercentOffDiscountToLineItems = ({
	lineItems,
	discount,
}: {
	lineItems: LineItem[];
	discount: StripeDiscountWithCoupon;
}): LineItem[] => {
	const coupon = discount.source.coupon;
	const percentOff = coupon.percent_off;

	if (!percentOff || percentOff === 0) {
		return lineItems;
	}

	return lineItems.map((item) => {
		// Check if discount applies to this line item
		if (!discountAppliesToLineItem({ discount, lineItem: item })) {
			return item;
		}

		// Use current finalAmount as base for multiplicative stacking
		// If no previous discounts, finalAmount equals amount
		const currentAmount = item.finalAmount ?? item.amount;

		// Calculate discount amount: |currentAmount| * (percentOff / 100)
		const itemDiscount = new Decimal(Math.abs(currentAmount))
			.times(percentOff)
			.dividedBy(100)
			.round()
			.toNumber();

		if (itemDiscount === 0) return item;

		const newDiscount: LineItemDiscount = {
			amountOff: itemDiscount,
			percentOff,
			stripeCouponId: coupon.id,
		};

		const existingDiscounts = item.discounts ?? [];

		const rawFinalAmount =
			item.context.direction === "refund"
				? new Decimal(currentAmount).plus(itemDiscount).toNumber()
				: new Decimal(currentAmount).minus(itemDiscount).toNumber();

		const finalAmount =
			item.context.direction === "refund"
				? Math.min(rawFinalAmount, 0)
				: Math.max(rawFinalAmount, 0);

		return {
			...item,
			discounts: [...existingDiscounts, newDiscount],
			finalAmount,
		};
	});
};
