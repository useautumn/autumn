import type { CustomLineItem, PreviewLineItem } from "@autumn/shared";

/** Transforms a CustomLineItem to a PreviewLineItem for API responses. */
export const customLineItemToPreviewLineItem = (
	item: CustomLineItem,
): PreviewLineItem => {
	return {
		object: "billing_preview_line_item" as const,
		title: item.description,
		description: item.description,
		amount: item.amount,
		discounts: [],
		is_base: false,
		total_quantity: 1,
		paid_quantity: 1,
		plan_id: "",
	};
};
