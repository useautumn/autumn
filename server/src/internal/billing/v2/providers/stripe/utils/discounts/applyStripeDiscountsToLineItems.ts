import type { LineItem, StripeDiscountWithCoupon } from "@autumn/shared";
import { applyAmountOffDiscountToLineItems } from "./applyAmountOffDiscountToLineItems";
import { applyPercentOffDiscountToLineItems } from "./applyPercentOffDiscountToLineItems";

const hasFreshRecurringDiscount = ({
	discounts,
}: {
	discounts: StripeDiscountWithCoupon[];
}) => {
	return discounts.some(
		(discount) =>
			!discount.id && discount.source.coupon.duration === "repeating",
	);
};

const disableDiscountableForRecurringDiscounts = ({
	lineItems,
}: {
	lineItems: LineItem[];
}) => {
	return lineItems.map((lineItem) => {
		if (!lineItem.chargeImmediately) return lineItem;

		return {
			...lineItem,
			context: {
				...lineItem.context,
				discountable: false,
			},
		};
	});
};

export const applyStripeDiscountsToLineItems = ({
	lineItems,
	discounts,
	options = {},
}: {
	lineItems: LineItem[];
	discounts: StripeDiscountWithCoupon[];
	options?: {
		skipDescriptionTag?: boolean;
		disableDiscountableForRecurringDiscounts?: boolean;
	};
}): LineItem[] => {
	if (
		options.disableDiscountableForRecurringDiscounts &&
		hasFreshRecurringDiscount({ discounts })
	) {
		lineItems = disableDiscountableForRecurringDiscounts({ lineItems });
	}

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
			options,
		});
	}

	for (const discount of amountOffDiscounts) {
		lineItems = applyAmountOffDiscountToLineItems({
			lineItems,
			discount,
			options,
		});
	}

	return lineItems;
};
