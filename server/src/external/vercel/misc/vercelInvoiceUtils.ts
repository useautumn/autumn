import type Stripe from "stripe";

export const VERCEL_INVOICE_ID_METADATA_KEY = "vercel_invoice_id";

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

export const getVercelInvoiceId = (invoice: Stripe.Invoice): string | null => {
	const id = invoice.metadata?.[VERCEL_INVOICE_ID_METADATA_KEY];
	return id ? id : null;
};

export const getVercelInstallationId = ({
	invoice,
	subscription,
}: {
	invoice: Stripe.Invoice;
	subscription?: Stripe.Subscription | null;
}): string | null =>
	subscription?.metadata?.vercel_installation_id ??
	invoice.metadata?.vercel_installation_id ??
	null;

/**
 * Stamps the Vercel invoice id (plus installation id, which subscription
 * invoices only carry on the parent sub) onto the Stripe invoice so refunds can
 * be routed to Vercel from the invoice alone. Stripe merges metadata per key.
 */
export const storeVercelInvoiceId = async ({
	stripeCli,
	stripeInvoiceId,
	vercelInvoiceId,
	installationId,
}: {
	stripeCli: Stripe;
	stripeInvoiceId: string | null | undefined;
	vercelInvoiceId: string | null | undefined;
	installationId: string;
}): Promise<void> => {
	if (!stripeInvoiceId || !vercelInvoiceId) return;
	await stripeCli.invoices.update(stripeInvoiceId, {
		metadata: {
			[VERCEL_INVOICE_ID_METADATA_KEY]: vercelInvoiceId,
			vercel_installation_id: installationId,
		},
	});
};

export const resolveVercelInstallationId = async ({
	stripeCli,
	invoice,
}: {
	stripeCli: Stripe;
	invoice: Stripe.Invoice;
}): Promise<string | null> => {
	const fromInvoice = getVercelInstallationId({ invoice });
	if (fromInvoice) return fromInvoice;

	const subscriptionId = getInvoiceSubscriptionId(invoice);
	if (!subscriptionId) return null;

	const subscription = await stripeCli.subscriptions.retrieve(subscriptionId);
	return getVercelInstallationId({ invoice, subscription });
};
