import Stripe from "stripe";

const isStripeResourceMissing = (error: unknown) =>
	error instanceof Stripe.errors.StripeInvalidRequestError &&
	error.code === "resource_missing";

/** Only a confirmed-missing invoice (e.g. a deleted draft) resolves to undefined; any other failure throws. */
export const retrieveStripeInvoiceIfExists = async ({
	stripeCli,
	stripeInvoiceId,
}: {
	stripeCli: Stripe;
	stripeInvoiceId: string;
}): Promise<Stripe.Invoice | undefined> => {
	try {
		return await stripeCli.invoices.retrieve(stripeInvoiceId);
	} catch (error) {
		if (isStripeResourceMissing(error)) return undefined;
		throw error;
	}
};
