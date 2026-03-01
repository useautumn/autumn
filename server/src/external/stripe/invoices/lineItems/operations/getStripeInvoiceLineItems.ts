import type Stripe from "stripe";

/** Expanded discount amount with full Discount object */
type ExpandedDiscountAmount = Omit<
	Stripe.InvoiceLineItem.DiscountAmount,
	"discount"
> & {
	discount: Stripe.Discount;
};

/** Invoice line item with expanded discount data */
export type ExpandedStripeInvoiceLineItem = Omit<
	Stripe.InvoiceLineItem,
	"discount_amounts" | "discounts"
> & {
	discount_amounts: ExpandedDiscountAmount[] | null;
	discounts: Stripe.Discount[];
};

/**
 * Fetches invoice line items with expanded discount data.
 * Expands discounts to access coupon IDs from discount.source.coupon.
 */
export const getStripeInvoiceLineItems = async ({
	stripeClient,
	invoiceId,
}: {
	stripeClient: Stripe;
	invoiceId: string;
}): Promise<ExpandedStripeInvoiceLineItem[]> => {
	const lineItems: ExpandedStripeInvoiceLineItem[] = [];

	// Use auto-pagination to get all line items
	for await (const lineItem of stripeClient.invoices.listLineItems(invoiceId, {
		expand: ["data.discounts", "data.discount_amounts.discount"],
		limit: 100,
	})) {
		lineItems.push(lineItem as ExpandedStripeInvoiceLineItem);
	}

	return lineItems;
};
