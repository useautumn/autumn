import type { LineItem } from "@models/billingModels/invoicingModels/lineItem";

/**
 * Filters out line item pairs where a deleted and new item have the same price ID
 * and their amounts cancel out (sum to 0).
 */
export const filterUnchangedPricesFromLineItems = ({
	deletedLineItems,
	newLineItems,
}: {
	deletedLineItems: LineItem[];
	newLineItems: LineItem[];
}): { deletedLineItems: LineItem[]; newLineItems: LineItem[] } => {
	const remainingDeletedLineItems: LineItem[] = [];
	const matchedNewLineItemIndices = new Set<number>();

	for (const deletedItem of deletedLineItems) {
		const deletedPriceId = deletedItem.context.price.id;

		// Find a matching new line item with the same price ID
		const matchingNewIndex = newLineItems.findIndex(
			(newItem, index) =>
				!matchedNewLineItemIndices.has(index) &&
				newItem.context.price.id === deletedPriceId,
		);

		if (matchingNewIndex !== -1) {
			const matchingNewItem = newLineItems[matchingNewIndex];
			const total = deletedItem.amount + matchingNewItem.amount;

			if (total === 0) {
				// Amounts cancel out - mark new item as matched (both will be removed)
				matchedNewLineItemIndices.add(matchingNewIndex);
				continue;
			}
		}

		// No canceling match found - keep this deleted item
		remainingDeletedLineItems.push(deletedItem);
	}

	// Filter out matched new line items
	const remainingNewLineItems = newLineItems.filter(
		(_, index) => !matchedNewLineItemIndices.has(index),
	);

	return {
		deletedLineItems: remainingDeletedLineItems,
		newLineItems: remainingNewLineItems,
	};
};
