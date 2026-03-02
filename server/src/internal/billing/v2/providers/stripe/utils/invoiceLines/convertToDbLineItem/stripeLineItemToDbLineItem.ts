import type { InsertDbInvoiceLineItem, LineItem } from "@autumn/shared";
import type Stripe from "stripe";
import type { ExpandedStripeInvoiceLineItem } from "@/external/stripe/invoices/lineItems/operations/getStripeInvoiceLineItems";
import { groupStripeLineItems } from "./groupStripeLineItems";
import { stripeLineItemGroupToDbLineItems } from "./stripeLineItemGroupToDbLineItems";

/** Map of subscription_item_id -> metadata */
export type SubscriptionItemMetadataMap = Map<string, Stripe.Metadata>;

/**
 * Converts multiple Stripe invoice line items to Autumn DB invoice line items.
 *
 * Groups Stripe line items by subscription_item/invoice_item first to handle
 * tiered pricing (where Stripe creates multiple line items per tier).
 *
 * Matching order:
 * 1. Match by autumn_line_item_id in metadata (best match)
 * 2. Match by autumn_customer_price_id in metadata
 * 3. Match by stripe_price_id (config.stripe_price_id or config.stripe_prepaid_price_v2_id)
 * 4. Match by stripe_product_id (product.processor?.id)
 *
 * Multi-entity support: One Stripe line item can match multiple Autumn line items.
 * All matched Autumn line items are removed from candidates to prevent double-matching.
 */
export const stripeLineItemsToDbLineItems = ({
	stripeLineItems,
	invoiceId,
	stripeInvoiceId,
	autumnLineItems,
	subscriptionItemMetadata,
}: {
	stripeLineItems: ExpandedStripeInvoiceLineItem[];
	invoiceId: string;
	stripeInvoiceId: string;
	autumnLineItems?: LineItem[];
	subscriptionItemMetadata?: SubscriptionItemMetadataMap;
}): InsertDbInvoiceLineItem[] => {
	// Track which autumn line items have been matched
	const remainingAutumnLineItems = [...(autumnLineItems ?? [])];
	const allDbLineItems: InsertDbInvoiceLineItem[] = [];

	// Group Stripe line items by subscription_item/invoice_item
	const groups = groupStripeLineItems({ stripeLineItems });

	for (const group of groups) {
		const { dbLineItems, matchedAutumnLineItems } =
			stripeLineItemGroupToDbLineItems({
				group,
				invoiceId,
				stripeInvoiceId,
				autumnLineItems: remainingAutumnLineItems,
				subscriptionItemMetadata,
			});

		// Remove ALL matched Autumn LineItems from candidates (multi-entity support)
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
