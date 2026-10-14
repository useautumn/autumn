import type { ExpandedStripeInvoiceLineItem } from "@/external/stripe/invoices/lineItems/operations/getStripeInvoiceLineItems";

export type StripeLineItemGroup = {
	groupKey: string;
	groupType: "subscription_item" | "invoice_item" | "ungrouped";
	lineItems: ExpandedStripeInvoiceLineItem[];
};

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
