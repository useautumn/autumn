import type { LineItem } from "@models/billingModels/lineItem/lineItem";
import type Stripe from "stripe";
import {
	billingLineItemMatchesStripeLineItem,
	LineItemMatchPriority,
} from "./billingLineItemMatchesStripeLineItem";

/**
 * Finds the best matching Autumn LineItem for a Stripe InvoiceLineItem.
 * Returns the first match at the highest priority level.
 *
 * Priority order:
 * 1. ExactLineItemId (autumn_line_item_id metadata)
 * 2. CustomerPriceId (autumn_customer_price_id metadata)
 * 3. StripePriceId (price config)
 * 4. StripeProductId (product processor)
 *
 * @returns The best matched LineItem or undefined if no match found
 */
export const findBillingLineItemByStripeLineItem = ({
	stripeLineItem,
	autumnLineItems,
}: {
	stripeLineItem: Stripe.InvoiceLineItem;
	autumnLineItems: LineItem[];
}): LineItem | undefined => {
	let bestMatch: LineItem | undefined;
	let bestPriority = LineItemMatchPriority.NoMatch;

	for (const lineItem of autumnLineItems) {
		const priority = billingLineItemMatchesStripeLineItem({
			lineItem,
			stripeLineItem,
		});

		// Skip non-matches
		if (priority === LineItemMatchPriority.NoMatch) continue;

		// If this is the first match or has higher priority (lower number)
		if (
			bestPriority === LineItemMatchPriority.NoMatch ||
			priority < bestPriority
		) {
			bestMatch = lineItem;
			bestPriority = priority;

			// ExactLineItemId is the best possible - return early
			if (priority === LineItemMatchPriority.ExactLineItemId) {
				return bestMatch;
			}
		}
	}

	return bestMatch;
};
