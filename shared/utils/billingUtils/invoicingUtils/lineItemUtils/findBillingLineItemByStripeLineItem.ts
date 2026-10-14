import type { LineItem } from "@models/billingModels/lineItem/lineItem";
import type Stripe from "stripe";
import {
	billingLineItemMatchesStripeLineItem,
	LineItemMatchPriority,
} from "./billingLineItemMatchesStripeLineItem";

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

		if (priority === LineItemMatchPriority.NoMatch) continue;

		if (
			bestPriority === LineItemMatchPriority.NoMatch ||
			priority < bestPriority
		) {
			bestMatch = lineItem;
			bestPriority = priority;

			if (priority === LineItemMatchPriority.ExactLineItemId) {
				return bestMatch;
			}
		}
	}

	return bestMatch;
};
