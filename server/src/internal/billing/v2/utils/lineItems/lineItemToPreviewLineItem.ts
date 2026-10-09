import type { LineItem, PreviewLineItem } from "@autumn/shared";
import { lineItemToStripeUnitPricing } from "@/internal/billing/v2/providers/stripe/utils/invoiceLines/lineItemToStripeUnitPricing";

// A line priced per tier shows the quantity its invoice line carries (1 when billed as one total).
const lineItemToPreviewQuantity = ({ line }: { line: LineItem }): number => {
	if (!line.unitPricing) return line.totalQuantity ?? 1;
	return lineItemToStripeUnitPricing({ lineItem: line })?.quantity ?? 1;
};

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
		quantity: lineItemToPreviewQuantity({ line }),
		period: line.context.effectivePeriod,
	};
};
