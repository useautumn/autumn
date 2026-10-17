import type { BillingContext } from "@autumn/shared";

/** Whether a trial's end bills on its own: a card on file is charged, and invoicing sends an invoice. */
export const billingContextBillsWithoutCustomer = ({
	billingContext,
}: {
	billingContext: BillingContext;
}) =>
	Boolean(
		billingContext.paymentMethod ||
			billingContext.invoiceMode ||
			billingContext.subscriptionInvoiceTerms,
	);
