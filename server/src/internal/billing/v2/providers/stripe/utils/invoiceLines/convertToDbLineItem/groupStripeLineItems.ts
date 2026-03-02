import type { ExpandedStripeInvoiceLineItem } from "@/external/stripe/invoices/lineItems/operations/getStripeInvoiceLineItems";

export type StripeLineItemGroup = {
	groupKey: string; // subscription_item_id or invoice_item_id or line_item_id
	groupType: "subscription_item" | "invoice_item" | "ungrouped";
	lineItems: ExpandedStripeInvoiceLineItem[];
};

/**
 * Groups Stripe line items by their parent subscription_item or invoice_item.
 * Tiered pricing creates multiple line items that share the same parent.
 */
export const groupStripeLineItems = ({
	stripeLineItems,
}: {
	stripeLineItems: ExpandedStripeInvoiceLineItem[];
}): StripeLineItemGroup[] => {
	const groups = new Map<string, StripeLineItemGroup>();

	for (const lineItem of stripeLineItems) {
		const parent = lineItem.parent;

		let groupKey: string;
		let groupType: StripeLineItemGroup["groupType"];

		if (parent?.subscription_item_details?.subscription_item) {
			groupKey = parent.subscription_item_details.subscription_item;
			groupType = "subscription_item";
		} else if (parent?.invoice_item_details?.invoice_item) {
			groupKey = parent.invoice_item_details.invoice_item;
			groupType = "invoice_item";
		} else {
			// Ungrouped - use line item ID as unique key
			groupKey = lineItem.id;
			groupType = "ungrouped";
		}

		const existing = groups.get(groupKey);
		if (existing) {
			existing.lineItems.push(lineItem);
		} else {
			groups.set(groupKey, {
				groupKey,
				groupType,
				lineItems: [lineItem],
			});
		}
	}

	return Array.from(groups.values());
};
