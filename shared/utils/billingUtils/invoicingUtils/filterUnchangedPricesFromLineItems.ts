import type { LineItem } from "@models/billingModels/lineItem/lineItem";

/**
 * Filters out line item pairs where a refund and charge item have the same price ID
 * and their amounts cancel out (sum to 0).
 */
export const filterUnchangedPricesFromLineItems = ({
	lineItems,
}: {
	lineItems: LineItem[];
}): LineItem[] => {
	// Split by direction
	const refundItems = lineItems.filter(
		(item) => item.context.direction === "refund",
	);
	const chargeItems = lineItems.filter(
		(item) => item.context.direction === "charge",
	);

	const remainingRefundItems: LineItem[] = [];
	const matchedChargeIndices = new Set<number>();

	for (const refundItem of refundItems) {
		const refundPriceId = refundItem.context.price.id;

		// Find a matching charge item with the same price ID
		const matchingChargeIndex = chargeItems.findIndex(
			(chargeItem, index) =>
				!matchedChargeIndices.has(index) &&
				chargeItem.context.price.id === refundPriceId,
		);

		if (matchingChargeIndex !== -1) {
			const matchingChargeItem = chargeItems[matchingChargeIndex];
			const total = refundItem.amount + matchingChargeItem.amount;

			if (total === 0) {
				// Amounts cancel out - mark charge item as matched (both will be removed)
				matchedChargeIndices.add(matchingChargeIndex);
				continue;
			}
		}

		// No canceling match found - keep this refund item
		remainingRefundItems.push(refundItem);
	}

	// Filter out matched charge items
	const remainingChargeItems = chargeItems.filter(
		(_, index) => !matchedChargeIndices.has(index),
	);

	return [...remainingRefundItems, ...remainingChargeItems];
};
