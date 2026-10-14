import type Stripe from "stripe";

type ExpandedDiscountAmount = Omit<
	Stripe.InvoiceLineItem.DiscountAmount,
	"discount"
> & {
	discount: Stripe.Discount;
};

export type ExpandedStripeInvoiceLineItem = Omit<
	Stripe.InvoiceLineItem,
	"discount_amounts" | "discounts"
> & {
	discount_amounts: ExpandedDiscountAmount[] | null;
	discounts: Stripe.Discount[];
};

export const getStripeInvoiceLineItems = async ({
	stripeClient,
	invoiceId,
}: {
	stripeClient: Stripe;
	invoiceId: string;
}): Promise<ExpandedStripeInvoiceLineItem[]> => {
	const lineItems: ExpandedStripeInvoiceLineItem[] = [];

	for await (const lineItem of stripeClient.invoices.listLineItems(invoiceId, {
		expand: ["data.discounts.source.coupon", "data.discount_amounts.discount"],
		limit: 100,
	})) {
		lineItems.push(lineItem as ExpandedStripeInvoiceLineItem);
	}

	return lineItems;
};
