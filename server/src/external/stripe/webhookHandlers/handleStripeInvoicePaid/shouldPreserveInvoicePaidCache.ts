import type { StripeInvoicePaidContext } from "./setupStripeInvoicePaidContext";

export const shouldPreserveInvoicePaidCache = ({
	eventContext,
}: {
	eventContext: StripeInvoicePaidContext;
}): boolean => {
	const { results } = eventContext;
	const hasProductChanges = results.updatedCustomerProductIds.length > 0;
	return (
		!hasProductChanges &&
		!results.appliedBillingPlan &&
		results.invoiceCache?.success === true
	);
};
