import type { LineItem, PreviewLineItem } from "@autumn/shared";

/**
 * Transforms an internal LineItem to a PreviewLineItem for API responses.
 * Used for both immediate charges and next cycle preview.
 */
export const lineItemToPreviewLineItem = (line: LineItem): PreviewLineItem => {
	const feature = line.context.feature;
	const title = feature?.name || line.context.product.name || "Item";
	const isBase = !feature;

	return {
		object: "billing_preview_line_item" as const,
		title,
		description: line.description,
		amount: line.amountAfterDiscounts,
		discounts: line.discounts,
		is_base: isBase,
		total_quantity: line.total_quantity ?? 1,
		paid_quantity: line.paid_quantity ?? 1,
		plan_id: line.context.product.id,
		deferred_for_trial: line.deferredForTrial,
		effective_period: line.context.effectivePeriod,
	};
};
