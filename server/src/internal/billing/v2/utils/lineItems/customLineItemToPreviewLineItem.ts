import type { CustomLineItem, PreviewLineItem } from "@autumn/shared";

/** Transforms a CustomLineItem to a PreviewLineItem for API responses. */
export const customLineItemToPreviewLineItem = (
	item: CustomLineItem,
): PreviewLineItem => {
	return {
		object: "billing_preview_line_item" as const,
		display_name: item.description,
		description: item.description,
		subtotal: item.amount,
		total: item.amount,
		discounts: [],
		plan_id: "",
		feature_id: null,
		custom: true,
		quantity: 1,
	};
};
