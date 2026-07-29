import type { CustomLineItem, LineItem, PreviewLineItem } from "@autumn/shared";

/** Transforms a CustomLineItem to a PreviewLineItem for API responses. */
export const customLineItemToPreviewLineItem = (
	item: CustomLineItem,
	lineItem?: LineItem,
): PreviewLineItem => {
	return {
		object: "billing_preview_line_item" as const,
		display_name: item.description,
		description: item.description,
		subtotal: item.amount,
		total: lineItem?.amountAfterDiscounts ?? item.amount,
		discounts:
			lineItem?.discounts.map((discount) => ({
				amount_off: discount.amountOff,
				percent_off: discount.percentOff,
				reward_id: discount.stripeCouponId,
				reward_name: discount.couponName,
			})) ?? [],
		plan_id: "",
		feature_id: null,
		custom: true,
		quantity: 1,
	};
};
