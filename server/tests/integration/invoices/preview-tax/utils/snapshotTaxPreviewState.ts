import type { ApiListInvoiceV1 } from "@autumn/shared";
import type { setupTaxedRenewal } from "./setupTaxedRenewal";

export const snapshotTaxPreviewState = async ({
	scenario,
}: {
	scenario: Awaited<ReturnType<typeof setupTaxedRenewal>>;
}) => {
	const { ctx, stripeCustomerId, autumnV2_4, customerId } = scenario;
	const stripe = ctx.stripeCli;
	const [customer, taxIds, invoices, subscriptions, autumnInvoices] =
		await Promise.all([
			stripe.customers.retrieve(stripeCustomerId),
			stripe.customers
				.listTaxIds(stripeCustomerId, { limit: 100 })
				.autoPagingToArray({ limit: 1000 }),
			stripe.invoices
				.list({ customer: stripeCustomerId, limit: 100 })
				.autoPagingToArray({ limit: 1000 }),
			stripe.subscriptions
				.list({ customer: stripeCustomerId, limit: 100, status: "all" })
				.autoPagingToArray({ limit: 1000 }),
			autumnV2_4.post("/invoices.list", {
				customer_id: customerId,
			}) as Promise<{ list: ApiListInvoiceV1[] }>,
		]);
	const { lastResponse: _lastResponse, ...customerState } = customer;
	const invoiceStates = invoices.map(
		({
			hosted_invoice_url: _hostedInvoiceUrl,
			invoice_pdf: _invoicePdf,
			...invoice
		}) => invoice,
	);
	return {
		customer: customerState,
		taxIds,
		invoices: invoiceStates,
		subscriptions,
		autumnInvoices,
	};
};
