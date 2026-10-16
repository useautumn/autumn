import type { InvoiceFacts } from "@autumn/shared/api/approvals/evaluate/index.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { buildApprovalCustomerFacts } from "@/internal/approvals/facts/customer/buildApprovalCustomerFacts";
import { CusService } from "@/internal/customers/CusService";
import type { InvoiceListRow } from "@/internal/invoices/InvoiceService";
import { invoiceToFacts } from "./invoiceToFacts";

/** Facts for an invoice row the caller already loaded. */
export const buildInvoiceRowFacts = async ({
	ctx,
	row,
	creditAmount,
}: {
	ctx: AutumnContext;
	row: InvoiceListRow;
	creditAmount?: number;
}): Promise<InvoiceFacts> => {
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: row.customer_id ?? row.invoice.internal_customer_id,
	});
	return invoiceToFacts({
		customer: await buildApprovalCustomerFacts({ ctx, fullCustomer }),
		invoice: row.invoice,
		creditAmount,
	});
};
