import type { BillingContext } from "@/internal/billing/v2/types";

export const isDeferredInvoiceMode = ({
	billingContext,
}: {
	billingContext: BillingContext;
}): boolean => {
	const isInvoiceMode = Boolean(billingContext.invoiceMode);
	const shouldDefer =
		billingContext.invoiceMode?.enableProductImmediately === false;

	return isInvoiceMode && shouldDefer;
};
