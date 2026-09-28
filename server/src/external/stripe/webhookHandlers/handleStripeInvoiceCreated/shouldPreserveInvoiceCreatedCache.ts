import type { InvoiceCreatedContext } from "./setupInvoiceCreatedContext";

export const shouldPreserveInvoiceCreatedCache = ({
	eventContext,
}: {
	eventContext: InvoiceCreatedContext;
}): boolean => {
	const { customerStateChanged, invoice } = eventContext.results;
	const invoiceCacheHandled =
		invoice === undefined ||
		invoice.cacheResult?.success === true ||
		invoice.cacheResult?.cacheMiss === true;

	return !customerStateChanged && invoiceCacheHandled;
};
