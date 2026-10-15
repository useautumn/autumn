import type {
	InvoiceIssueMethod,
	InvoiceMode,
	InvoiceModeParams,
} from "@autumn/shared";

/** issue_method wins over the deprecated finalize; sending neither sends the invoice. */
export const invoiceModeParamsToIssueMethod = ({
	invoiceModeParams,
}: {
	invoiceModeParams: Pick<InvoiceModeParams, "finalize" | "issue_method">;
}): InvoiceIssueMethod =>
	invoiceModeParams.issue_method ??
	(invoiceModeParams.finalize === false ? "draft" : "send");

/** A context stored before issue_method existed only knows whether it finalized, which then meant send. */
export const invoiceModeToIssueMethod = ({
	invoiceMode,
}: {
	invoiceMode: InvoiceMode;
}): InvoiceIssueMethod =>
	invoiceMode.issueMethod ?? (invoiceMode.finalizeInvoice ? "send" : "draft");
