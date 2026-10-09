export const ARREAR_USAGE_LINE_ID_PREFIX = "invoice_li_usage_";
export const ARREAR_TIER_LINE_ID_PREFIX = "invoice_li_tier_";

/**
 * Stable per-invoice id for a usage line, so a retried invoice.created finds the lines it wrote.
 * The first band keeps the single-line id, so lines written before per-tier billing still match.
 */
export const arrearUsageLineItemId = ({
	idempotencyScope,
	customerPriceId,
	index,
}: {
	idempotencyScope: string;
	customerPriceId: string;
	index: number;
}): string =>
	index === 0
		? `${ARREAR_USAGE_LINE_ID_PREFIX}${idempotencyScope}_${customerPriceId}`
		: `${ARREAR_TIER_LINE_ID_PREFIX}${idempotencyScope}_${customerPriceId}_${index}`;
