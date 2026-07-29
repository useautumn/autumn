import type { LineItem, StripeDiscountWithCoupon } from "@autumn/shared";
import { applyAmountOffDiscountToLineItems } from "./applyAmountOffDiscountToLineItems";
import { applyPercentOffDiscountToLineItems } from "./applyPercentOffDiscountToLineItems";

const hasFreshDiscount = ({
	discounts,
}: {
	discounts: StripeDiscountWithCoupon[];
}) => {
	return discounts.some((discount) => !discount.id);
};

const disableDiscountableForFreshDiscounts = ({
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
		disableDiscountableForFreshDiscounts?: boolean;
	};
}): LineItem[] => {
	if (
		options.disableDiscountableForFreshDiscounts &&
		hasFreshDiscount({ discounts })
	) {
		lineItems = disableDiscountableForFreshDiscounts({ lineItems });
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
