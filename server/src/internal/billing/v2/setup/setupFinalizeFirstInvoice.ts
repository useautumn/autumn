import type { BillingContextOverride, InvoiceMode } from "@autumn/shared";

export const setupFinalizeFirstInvoice = ({
	contextOverride,
	invoiceMode,
}: {
	contextOverride?: BillingContextOverride;
	invoiceMode?: InvoiceMode;
}): boolean => {
	if (contextOverride?.shouldFinalizeFirstInvoice !== undefined) {
		return contextOverride.shouldFinalizeFirstInvoice;
	}

	if (invoiceMode?.finalizeInvoice) {
		return true;
	}

	return false;
};
