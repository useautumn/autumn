import type { FullCustomer, Invoice } from "@autumn/shared";
import type { InvoiceFacts } from "@autumn/shared/api/approvals/evaluate/index.js";

/** An existing invoice; `refundAmount` is set when the action refunds or credits it. */
export const invoiceToFacts = ({
	fullCustomer,
	invoice,
	refundAmount,
}: {
	fullCustomer: FullCustomer;
	invoice: Pick<Invoice, "total">;
	refundAmount?: number;
}): InvoiceFacts => ({
	customer: fullCustomer,
	total: invoice.total,
	refund: refundAmount === undefined ? null : { amount: refundAmount },
});
