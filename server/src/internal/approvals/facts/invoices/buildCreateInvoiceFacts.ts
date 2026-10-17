import type { CreateInvoiceParams } from "@autumn/shared";
import type { InvoiceFacts } from "@autumn/shared/api/approvals/evaluate/index.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { buildApprovalCustomerFacts } from "@/internal/approvals/facts/customer/buildApprovalCustomerFacts";
import { planInvoice } from "@/internal/invoices/actions/create/planInvoice";
import { invoicePreviewToFacts } from "./invoicePreviewToFacts";

/** A new invoice, judged on a write-free preview: an unknown customer as creation would make it. */
export const buildCreateInvoiceFacts = async ({
	ctx,
	params,
	nowMs,
}: {
	ctx: AutumnContext;
	params: CreateInvoiceParams;
	nowMs: number;
}): Promise<InvoiceFacts> => {
	const { invoiceContext, stripePlan } = await planInvoice({
		ctx,
		params,
		nowMs,
		preview: true,
		previewNewCustomer: true,
	});
	return invoicePreviewToFacts({
		customer: await buildApprovalCustomerFacts({
			ctx,
			fullCustomer: invoiceContext.fullCustomer,
		}),
		preview: stripePlan.preview,
	});
};
