import type { LineItem, PreviewUsageLineItem } from "@autumn/shared";

/**
 * Transforms an internal LineItem to a PreviewLineItem for API responses.
 * Used for both immediate charges and next cycle preview.
 */
export const lineItemToPreviewUsageLineItem = (
	line: LineItem,
): PreviewUsageLineItem => {
	const feature = line.context.feature;
	const displayName = feature?.name || line.context.product.name || "Item";

	return {
		display_name: displayName,
		plan_id: line.context.product.id,
		feature_id: feature?.id ?? null,
		period: line.context.effectivePeriod,
	};
};
