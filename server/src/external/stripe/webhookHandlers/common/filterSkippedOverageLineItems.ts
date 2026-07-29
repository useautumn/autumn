import {
	type FullCustomer,
	fullCustomerToSkipOverageBilling,
	type LineItem,
} from "@autumn/shared";

/**
 * Partition arrear line items by whether their feature resolves to an enabled
 * spend_limit with skip_overage_billing (entity > customer > plan). Skipped
 * items are never posted to Stripe; balance resets are unaffected.
 */
export const partitionSkippedOverageLineItems = ({
	fullCustomer,
	lineItems,
}: {
	fullCustomer: FullCustomer;
	lineItems: LineItem[];
}): { billableLineItems: LineItem[]; skippedLineItems: LineItem[] } => {
	const billableLineItems: LineItem[] = [];
	const skippedLineItems: LineItem[] = [];

	for (const lineItem of lineItems) {
		const featureId = lineItem.context.feature?.id;

		const skipOverageBilling = featureId
			? fullCustomerToSkipOverageBilling({
					fullCustomer,
					featureId,
					internalEntityId: lineItem.context.entity?.internal_id,
				})
			: false;

		if (skipOverageBilling) {
			skippedLineItems.push(lineItem);
		} else {
			billableLineItems.push(lineItem);
		}
	}

	return { billableLineItems, skippedLineItems };
};
