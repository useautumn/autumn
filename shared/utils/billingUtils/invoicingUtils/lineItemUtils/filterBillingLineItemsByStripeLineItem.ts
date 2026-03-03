import type { LineItem } from "@models/billingModels/lineItem/lineItem";
import type Stripe from "stripe";
import {
	billingLineItemMatchesStripeLineItem,
	LineItemMatchPriority,
} from "./billingLineItemMatchesStripeLineItem";

/**
 * Filters ALL matching Autumn LineItems for a Stripe InvoiceLineItem.
 * Used for multi-entity scenarios where one Stripe line item represents
 * charges for multiple customer products.
 *
 * Returns all matches at the highest priority level found:
 * 1. ExactLineItemId (returns single item)
 * 2. CustomerPriceId (can be multiple for multi-entity)
 * 3. StripePriceId (can be multiple for multi-entity)
 * 4. StripeProductId (can be multiple for multi-entity)
 *
 * @returns Array of matched LineItems (empty if no matches)
 */
export const filterBillingLineItemsByStripeLineItem = ({
	stripeLineItem,
	autumnLineItems,
	subscriptionItemMetadata,
}: {
	stripeLineItem: Stripe.InvoiceLineItem;
	autumnLineItems: LineItem[];
	subscriptionItemMetadata?: Stripe.Metadata;
}): LineItem[] => {
	// Score each line item
	const scoredItems = autumnLineItems
		.map((lineItem) => ({
			lineItem,
			priority: billingLineItemMatchesStripeLineItem({
				lineItem,
				stripeLineItem,
				subscriptionItemMetadata,
			}),
		}))
		.filter((item) => item.priority !== LineItemMatchPriority.NoMatch);

	if (scoredItems.length === 0) return [];

	// Find the highest priority (lowest number)
	const highestPriority = Math.min(...scoredItems.map((item) => item.priority));

	// Return all items at the highest priority level
	return scoredItems
		.filter((item) => item.priority === highestPriority)
		.map((item) => item.lineItem);
};
