import type {
	LineItem,
	LineItemDiscount,
	StripeDiscountWithCoupon,
} from "@autumn/shared";
import { atmnToStripeAmount, stripeToAtmnAmount } from "@autumn/shared";
import { Decimal } from "decimal.js";
import { addDiscountTagToDescription } from "./addDiscountTagToDescription";
import { discountAppliesToLineItem } from "./discountAppliesToLineItem";
import { getBackdatedDiscountCycleCount } from "./getBackdatedDiscountCycleCount";

const roundToMinorUnits = ({
	amount,
	currency,
}: {
	amount: number;
	currency: string;
}) =>
	stripeToAtmnAmount({
		amount: atmnToStripeAmount({ amount, currency }),
		currency,
	});

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

		// Stripe bills each line in whole minor units, then discounts it; stacked discounts compound on the result.
		const currentAmount = roundToMinorUnits({
			amount: item.amountAfterDiscounts ?? item.amount,
			currency: item.context.currency,
		});
		const eligibleCycles = getBackdatedDiscountCycleCount({
			lineItem: item,
			coupon,
		});
		if (eligibleCycles <= 0) return item;

		const discountableAmount = item.context.backdate
			? new Decimal(Math.abs(currentAmount))
					.div(item.context.backdate.cycleCount)
					.mul(eligibleCycles)
					.toNumber()
			: Math.abs(currentAmount);

		// Calculate discount amount: |currentAmount| * (percentOff / 100)
		const itemDiscount = new Decimal(discountableAmount)
			.times(percentOff)
			.dividedBy(100)
			.toNumber();

		if (itemDiscount === 0) return item;

		const newDiscount: LineItemDiscount = {
			amountOff: itemDiscount,
			percentOff,
			stripeCouponId: coupon.id,
			couponName: coupon.name || coupon.id,
		};

		const existingDiscounts = item.discounts ?? [];

		const isProrationCredit = item.context.direction === "refund";
		const amountAfterDiscounts = isProrationCredit
			? Math.min(new Decimal(currentAmount).plus(itemDiscount).toNumber(), 0)
			: Math.max(new Decimal(currentAmount).minus(itemDiscount).toNumber(), 0);

		const description =
			item.context.discountable || options.skipDescriptionTag
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
