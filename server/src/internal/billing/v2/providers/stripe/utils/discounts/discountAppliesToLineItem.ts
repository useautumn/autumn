import type { LineItem, ResolvedStripeCoupon } from "@autumn/shared";

/**
 * Checks if a discount applies to a specific line item based on applies_to.products
 */
export const discountAppliesToLineItem = ({
	discount,
	lineItem,
}: {
	discount: ResolvedStripeCoupon;
	lineItem: LineItem;
}): boolean => {
	// Discounts only apply to charges, not refunds
	if (lineItem.context.direction === "refund") {
		return false;
	}

	const appliesToProducts = discount.source.coupon.applies_to?.products;

	// If no applies_to, discount applies to all products
	if (!appliesToProducts || appliesToProducts.length === 0) {
		return true;
	}

	// Check if line item's product is in the applies_to list
	return lineItem.stripeProductId
		? appliesToProducts.includes(lineItem.stripeProductId)
		: false;
};
