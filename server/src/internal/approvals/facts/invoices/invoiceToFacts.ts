import type { Invoice } from "@autumn/shared";
import type {
	ApprovalCustomerFacts,
	InvoiceFacts,
} from "@autumn/shared/api/approvals/evaluate/index.js";

/** An existing invoice; `creditAmount` is set when the action credits it. Money is in major units. */
export const invoiceToFacts = ({
	customer,
	invoice,
	creditAmount,
}: {
	customer: ApprovalCustomerFacts;
	invoice: Pick<Invoice, "total">;
	creditAmount?: number;
}): InvoiceFacts => ({
	customer,
	total: invoice.total,
	refund: creditAmount === undefined ? null : { amount: creditAmount },
});
