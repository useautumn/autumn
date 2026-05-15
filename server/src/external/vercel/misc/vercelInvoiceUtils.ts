import type Stripe from "stripe";

/**
 * Resolves the parent Stripe subscription ID for a Vercel marketplace invoice,
 * walking the line items to find the first one with a subscription parent.
 * Returns null for one-off / non-subscription invoices.
 */
export const getInvoiceSubscriptionId = (
	invoice: Stripe.Invoice,
): string | null => {
	const line = invoice.lines.data.find(
		(l) =>
			l.parent?.subscription_item_details?.subscription !== null &&
			l.parent?.subscription_item_details?.subscription !== undefined,
	);
	return (
		(line?.parent?.subscription_item_details?.subscription as string) ?? null
	);
};
