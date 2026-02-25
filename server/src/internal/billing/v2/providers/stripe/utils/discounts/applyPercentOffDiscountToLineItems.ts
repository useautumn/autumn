import type {
	LineItem,
	LineItemDiscount,
	StripeDiscountWithCoupon,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import { addDiscountTagToDescription } from "./addDiscountTagToDescription";
import { discountAppliesToLineItem } from "./discountAppliesToLineItem";

/**
 * Applies a percent_off discount to line items.
 * Applies the percentage to each applicable line item individually.
 */
export const applyPercentOffDiscountToLineItems = ({
	lineItems,
	discount,
	options = {},
}: {
	lineItems: LineItem[];
	discount: StripeDiscountWithCoupon;
	options?: {
		skipDescriptionTag?: boolean;
	};
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

		// Use current amountAfterDiscounts as base for multiplicative stacking
		// If no previous discounts, amountAfterDiscounts equals amount
		const currentAmount = item.amountAfterDiscounts ?? item.amount;

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
			couponName: coupon.name || coupon.id,
		};

		const existingDiscounts = item.discounts ?? [];

		// Discounts only apply to charges (refunds filtered by discountAppliesToLineItem)
		// Cap at 0 to prevent negative charges
		const amountAfterDiscounts = Math.max(
			new Decimal(currentAmount).minus(itemDiscount).toNumber(),
			0,
		);

		const description = options.skipDescriptionTag
			? item.description
			: addDiscountTagToDescription({ description: item.description });

		return {
			...item,
			description,
			discounts: [...existingDiscounts, newDiscount],
			amountAfterDiscounts,
		};
	});
};
