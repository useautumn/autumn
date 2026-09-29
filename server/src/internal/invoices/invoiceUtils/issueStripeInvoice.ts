import type { InvoiceIssueMethod } from "@autumn/shared";
import type Stripe from "stripe";
import { finalizeStripeInvoice } from "@/internal/billing/v2/providers/stripe/utils/invoices/stripeInvoiceOps";

/** Advances a populated draft as far as the issue method asks; auto_advance is what makes Stripe email and collect. */
export const issueStripeInvoice = async ({
	stripeCli,
	draft,
	issueMethod = "send",
}: {
	stripeCli: Stripe;
	draft: Stripe.Invoice;
	issueMethod?: InvoiceIssueMethod;
}): Promise<Stripe.Invoice> => {
	if (issueMethod === "draft") return draft;

	return finalizeStripeInvoice({
		stripeCli,
		invoiceId: draft.id,
		autoAdvance: issueMethod === "send",
	});
};
