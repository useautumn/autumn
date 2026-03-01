import type Stripe from "stripe";
import type { ExpandedStripeInvoiceLineItem } from "@/external/stripe/invoices/lineItems/operations/getStripeInvoiceLineItems.js";
import { getStripeSubscriptionItem } from "@/external/stripe/subscriptions/subscriptionItems/operations/getStripeSubscriptionItem.js";

/** Map of subscription_item_id -> metadata */
export type SubscriptionItemMetadataMap = Map<string, Stripe.Metadata>;

/**
 * Fetches metadata for subscription items referenced by invoice line items.
 * Only fetches for line items that have a subscription_item parent (not invoice items).
 */
export const fetchSubscriptionItemsMetadata = async ({
	stripeCli,
	stripeLineItems,
}: {
	stripeCli: Stripe;
	stripeLineItems: ExpandedStripeInvoiceLineItem[];
}): Promise<SubscriptionItemMetadataMap> => {
	const metadataMap: SubscriptionItemMetadataMap = new Map();

	// Collect unique subscription item IDs
	const subscriptionItemIds = new Set<string>();
	for (const lineItem of stripeLineItems) {
		const subItemId =
			lineItem.parent?.subscription_item_details?.subscription_item;
		if (typeof subItemId === "string") {
			subscriptionItemIds.add(subItemId);
		}
	}

	if (subscriptionItemIds.size === 0) {
		return metadataMap;
	}

	// Fetch subscription items in parallel
	const fetchPromises = Array.from(subscriptionItemIds).map(async (id) => {
		const subItem = await getStripeSubscriptionItem({
			stripeCli,
			subscriptionItemId: id,
		});
		return subItem ? { id, metadata: subItem.metadata } : null;
	});

	const results = await Promise.all(fetchPromises);

	for (const result of results) {
		if (result) {
			metadataMap.set(result.id, result.metadata);
		}
	}

	return metadataMap;
};
