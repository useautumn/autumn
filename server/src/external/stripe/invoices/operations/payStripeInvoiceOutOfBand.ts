import type Stripe from "stripe";

/**
 * Settles a finalized invoice without charging: the money moved elsewhere
 * (a marketplace, a bank transfer). Already-paid invoices are returned as is.
 */
export const payStripeInvoiceOutOfBand = async ({
	stripeCli,
	stripeInvoice,
}: {
	stripeCli: Stripe;
	stripeInvoice: Stripe.Invoice;
}): Promise<Stripe.Invoice> => {
	if (stripeInvoice.status === "paid") return stripeInvoice;

	try {
		return await stripeCli.invoices.pay(stripeInvoice.id!, {
			paid_out_of_band: true,
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : "";
		if (message.includes("already paid")) {
			return stripeCli.invoices.retrieve(stripeInvoice.id!);
		}
		throw error;
	}
};
