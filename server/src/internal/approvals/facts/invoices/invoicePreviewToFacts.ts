import type {
	ApprovalCustomerFacts,
	InvoiceFacts,
} from "@autumn/shared/api/approvals/evaluate/index.js";

/** A new or reissued invoice, judged on its preview's total so a rule sees what will be billed. */
export const invoicePreviewToFacts = ({
	customer,
	preview,
}: {
	customer: ApprovalCustomerFacts;
	preview: { total: number };
}): InvoiceFacts => ({
	customer,
	total: preview.total,
	refund: null,
});
