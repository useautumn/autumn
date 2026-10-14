import type { LineItem, PreviewUsageLineItem } from "@autumn/shared";

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
