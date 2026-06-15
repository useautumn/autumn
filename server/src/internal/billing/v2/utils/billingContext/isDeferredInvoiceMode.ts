import type { BillingContext } from "@autumn/shared";

export const isDeferredInvoiceMode = ({
	billingContext,
}: {
	billingContext: BillingContext;
}): boolean => {
	const isInvoiceMode = Boolean(billingContext.invoiceMode);

	// Top-level enable_plan_immediately is authoritative over invoice_mode's nested flag.
	if (billingContext.enablePlanImmediately === true) return false;

	const shouldDefer =
		billingContext.invoiceMode?.enableProductImmediately === false;

	return isInvoiceMode && shouldDefer;
};
