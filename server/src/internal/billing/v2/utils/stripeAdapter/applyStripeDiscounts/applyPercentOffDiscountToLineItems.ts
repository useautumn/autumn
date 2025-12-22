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

		// Calculate discount amount: |amount| * (percentOff / 100)
		const itemDiscount = new Decimal(Math.abs(item.amount))
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
