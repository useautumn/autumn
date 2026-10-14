import type { LineItem } from "@models/billingModels/lineItem/lineItem";
import type Stripe from "stripe";
import {
	billingLineItemMatchesStripeLineItem,
	LineItemMatchPriority,
} from "./billingLineItemMatchesStripeLineItem";

export const filterBillingLineItemsByStripeLineItem = ({
	stripeLineItem,
	autumnLineItems,
	subscriptionItemMetadata,
}: {
	stripeLineItem: Stripe.InvoiceLineItem;
	autumnLineItems: LineItem[];
	subscriptionItemMetadata?: Stripe.Metadata;
}): LineItem[] => {
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
