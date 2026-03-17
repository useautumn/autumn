import type { LineItem, PreviewLineItem } from "@autumn/shared";

/**
 * Transforms an internal LineItem to a PreviewLineItem for API responses.
 * Used for both immediate charges and next cycle preview.
 */
export const lineItemToPreviewLineItem = (line: LineItem): PreviewLineItem => {
	const feature = line.context.feature;
	const displayName = feature?.name || line.context.product.name || "Item";

	return {
		object: "billing_preview_line_item" as const,
		display_name: displayName,
		description: line.description,
		subtotal: line.amount,
		total: line.amountAfterDiscounts,
		discounts: line.discounts.map((discount) => ({
			amount_off: discount.amountOff,
			percent_off: discount.percentOff,
			reward_id: discount.stripeCouponId,
			reward_name: discount.couponName,
		})),
		plan_id: line.context.product.id,
		feature_id: feature?.id ?? null,
		custom: false,
		quantity: line.totalQuantity ?? 1,
		period: line.context.effectivePeriod,
	};
};
