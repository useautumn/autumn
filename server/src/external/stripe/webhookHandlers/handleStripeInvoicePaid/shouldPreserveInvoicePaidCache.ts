import type { StripeInvoicePaidContext } from "./setupStripeInvoicePaidContext";

export const shouldPreserveInvoicePaidCache = ({
	eventContext,
}: {
	eventContext: StripeInvoicePaidContext;
}): boolean => {
	const { results } = eventContext;
	const hasProductChanges = results.updatedCustomerProductIds.length > 0;
	const invoiceCacheHandled =
		results.invoiceCache?.success === true ||
		results.invoiceCache?.cacheMiss === true;
	return (
		!hasProductChanges && !results.appliedBillingPlan && invoiceCacheHandled
	);
};
