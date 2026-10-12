export const ARREAR_USAGE_LINE_ID_PREFIX = "invoice_li_usage_";
export const ARREAR_TIER_LINE_ID_PREFIX = "invoice_li_tier_";

/** The id every band of one price's usage shares on an invoice: the first band's id. */
export const arrearLineItemIdToSetId = ({
	lineItemId,
}: {
	lineItemId: string;
}): string | undefined => {
	if (lineItemId.startsWith(ARREAR_USAGE_LINE_ID_PREFIX)) return lineItemId;
	if (!lineItemId.startsWith(ARREAR_TIER_LINE_ID_PREFIX)) return undefined;

	const scopeAndPrice = lineItemId.slice(
		ARREAR_TIER_LINE_ID_PREFIX.length,
		lineItemId.lastIndexOf("_"),
	);
	return `${ARREAR_USAGE_LINE_ID_PREFIX}${scopeAndPrice}`;
};
