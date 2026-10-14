import type { LineItem } from "@models/billingModels/lineItem/lineItem";
import { BILLING_AMOUNT_EPSILON } from "./billingConstants";

export const filterUnchangedPricesFromLineItems = ({
	lineItems,
}: {
	lineItems: LineItem[];
}): LineItem[] => {
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

		const matchingChargeIndex = chargeItems.findIndex(
			(chargeItem, index) =>
				!matchedChargeIndices.has(index) &&
				chargeItem.context.price.id === refundPriceId,
		);

		if (matchingChargeIndex !== -1) {
			const matchingChargeItem = chargeItems[matchingChargeIndex];
			const netAmount = Math.abs(refundItem.amount + matchingChargeItem.amount);

			if (netAmount < BILLING_AMOUNT_EPSILON) {
				matchedChargeIndices.add(matchingChargeIndex);
				continue;
			}
		}

		remainingRefundItems.push(refundItem);
	}

	const remainingChargeItems = chargeItems.filter(
		(_, index) => !matchedChargeIndices.has(index),
	);

	return [...remainingRefundItems, ...remainingChargeItems];
};
