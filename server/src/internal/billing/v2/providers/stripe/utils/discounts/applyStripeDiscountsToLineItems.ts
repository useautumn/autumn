import type { LineItem, StripeDiscountWithCoupon } from "@autumn/shared";
import { applyAmountOffDiscountToLineItems } from "./applyAmountOffDiscountToLineItems";
import { applyPercentOffDiscountToLineItems } from "./applyPercentOffDiscountToLineItems";

export const applyStripeDiscountsToLineItems = ({
	lineItems,
	discounts,
}: {
	lineItems: LineItem[];
	discounts: StripeDiscountWithCoupon[];
}): LineItem[] => {
	const percentOffDiscounts = discounts.filter(
		(d) => d.source.coupon.percent_off,
	);
	const amountOffDiscounts = discounts.filter(
		(d) => d.source.coupon.amount_off,
	);

	for (const discount of percentOffDiscounts) {
		lineItems = applyPercentOffDiscountToLineItems({
			lineItems,
			discount,
		});
	}

	for (const discount of amountOffDiscounts) {
		lineItems = applyAmountOffDiscountToLineItems({ lineItems, discount });
	}

	return lineItems;
};
