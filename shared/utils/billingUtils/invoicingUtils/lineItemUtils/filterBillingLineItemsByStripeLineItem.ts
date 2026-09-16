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
 * A metadata match names only one entity's customer price, yet Stripe merges
 * every entity sharing the same Stripe price into one line. Siblings that match
 * this line by stripe_price_id are kept so the merged line is attributed to all
 * of them. Product-level matches are not siblings: per-entity inline prices get
 * their own Stripe line each.
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

	const topMatches = scoredItems
		.filter((item) => item.priority === highestPriority)
		.map((item) => item.lineItem);

	if (highestPriority !== LineItemMatchPriority.CustomerPriceId) {
		return topMatches;
	}

	const mergedPriceIds = new Set(topMatches.map((li) => li.context.price.id));
	const siblingsOnSameStripePrice = scoredItems
		.filter(
			(item) =>
				item.priority === LineItemMatchPriority.StripePriceId &&
				mergedPriceIds.has(item.lineItem.context.price.id),
		)
		.map((item) => item.lineItem);

	return [...topMatches, ...siblingsOnSameStripePrice];
};
