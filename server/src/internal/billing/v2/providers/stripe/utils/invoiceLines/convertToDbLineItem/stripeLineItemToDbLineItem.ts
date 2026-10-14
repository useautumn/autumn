import type { InsertDbInvoiceLineItem, LineItem } from "@autumn/shared";
import type Stripe from "stripe";
import type { ExpandedStripeInvoiceLineItem } from "@/external/stripe/invoices/lineItems/operations/getStripeInvoiceLineItems";
import { groupStripeLineItems } from "./groupStripeLineItems";
import { stripeLineItemGroupToDbLineItems } from "./stripeLineItemGroupToDbLineItems";

export type SubscriptionItemMetadataMap = Map<string, Stripe.Metadata>;

export const stripeLineItemsToDbLineItems = ({
	stripeLineItems,
	stripeDiscounts,
	invoiceId,
	stripeInvoiceId,
	autumnLineItems,
	subscriptionItemMetadata,
}: {
	stripeLineItems: ExpandedStripeInvoiceLineItem[];
	stripeDiscounts: Stripe.Discount[];
	invoiceId: string;
	stripeInvoiceId: string;
	autumnLineItems?: LineItem[];
	subscriptionItemMetadata?: SubscriptionItemMetadataMap;
}): InsertDbInvoiceLineItem[] => {
	const remainingAutumnLineItems = [...(autumnLineItems ?? [])];
	const allDbLineItems: InsertDbInvoiceLineItem[] = [];

	const groups = groupStripeLineItems({ stripeLineItems });

	for (const group of groups) {
		const { dbLineItems, matchedAutumnLineItems } =
			stripeLineItemGroupToDbLineItems({
				group,
				stripeDiscounts,
				invoiceId,
				stripeInvoiceId,
				autumnLineItems: remainingAutumnLineItems,
				subscriptionItemMetadata,
			});

		for (const matchedItem of matchedAutumnLineItems) {
			const matchIndex = remainingAutumnLineItems.findIndex(
				(li) => li.id === matchedItem.id,
			);
			if (matchIndex !== -1) {
				remainingAutumnLineItems.splice(matchIndex, 1);
			}
		}

		allDbLineItems.push(...dbLineItems);
	}

	return allDbLineItems;
};
