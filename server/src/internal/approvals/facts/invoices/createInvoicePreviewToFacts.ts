import type { CreateInvoicePreview, FullCustomer } from "@autumn/shared";
import type { InvoiceFacts } from "@autumn/shared/api/approvals/evaluate/index.js";

/** A new invoice, judged on its preview's total so a rule sees what will be billed. */
export const createInvoicePreviewToFacts = ({
	fullCustomer,
	preview,
}: {
	fullCustomer: FullCustomer;
	preview: Pick<CreateInvoicePreview, "total">;
}): InvoiceFacts => ({
	customer: fullCustomer,
	total: preview.total,
	refund: null,
});
