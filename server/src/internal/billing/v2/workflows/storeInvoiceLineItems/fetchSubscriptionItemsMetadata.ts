import type Stripe from "stripe";
import type { ExpandedStripeInvoiceLineItem } from "@/external/stripe/invoices/lineItems/operations/getStripeInvoiceLineItems.js";
import { getStripeSubscriptionItem } from "@/external/stripe/subscriptions/subscriptionItems/operations/getStripeSubscriptionItem.js";

/** Info about a subscription item needed for line item matching and filtering */
export type SubscriptionItemInfo = {
	metadata: Stripe.Metadata;
	/** Whether the price is metered (usage-based) */
	isMetered: boolean;
};

/** Map of subscription_item_id -> info */
export type SubscriptionItemInfoMap = Map<string, SubscriptionItemInfo>;

/**
 * Fetches info for subscription items referenced by invoice line items.
 * Returns metadata (for matching) and isMetered flag (for filtering $0 placeholders).
 */
export const fetchSubscriptionItemsInfo = async ({
	stripeCli,
	stripeLineItems,
}: {
	stripeCli: Stripe;
	stripeLineItems: ExpandedStripeInvoiceLineItem[];
}): Promise<SubscriptionItemInfoMap> => {
	const infoMap: SubscriptionItemInfoMap = new Map();

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
		return infoMap;
	}

	// Fetch subscription items in parallel
	const fetchPromises = Array.from(subscriptionItemIds).map(async (id) => {
		const subItem = await getStripeSubscriptionItem({
			stripeCli,
			subscriptionItemId: id,
		});
		if (!subItem) return null;

		const price = subItem.price as Stripe.Price;
		const isMetered = price.recurring?.usage_type === "metered";

		return { id, metadata: subItem.metadata, isMetered };
	});

	const results = await Promise.all(fetchPromises);

	for (const result of results) {
		if (result) {
			infoMap.set(result.id, {
				metadata: result.metadata,
				isMetered: result.isMetered,
			});
		}
	}

	return infoMap;
};
