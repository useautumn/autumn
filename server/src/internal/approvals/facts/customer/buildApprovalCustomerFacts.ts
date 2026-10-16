import type { FullCustomer } from "@autumn/shared";
import type { ApprovalCustomerFacts } from "@autumn/shared/api/approvals/evaluate/index.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { invoiceRepo } from "@/internal/invoices/repos/invoiceRepo";

/** The customer as rules read it. `has_paid` is its own query: a full customer carries only recent invoices. */
export const buildApprovalCustomerFacts = async ({
	ctx,
	fullCustomer,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
}): Promise<ApprovalCustomerFacts> => ({
	id: fullCustomer.id,
	customer_products: fullCustomer.customer_products,
	has_paid: await invoiceRepo.customerHasPaidInvoice({
		ctx,
		internalCustomerId: fullCustomer.internal_id,
	}),
});
