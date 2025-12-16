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
	for (const discount of discounts) {
		if (discount.source.coupon.percent_off) {
			lineItems = applyPercentOffDiscountToLineItems({
				lineItems,
				discount,
			});
		} else if (discount.source.coupon.amount_off) {
			lineItems = applyAmountOffDiscountToLineItems({ lineItems, discount });
		}
	}
	return lineItems;
};
