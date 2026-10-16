import type { CreateInvoiceParams } from "@autumn/shared";
import { ms } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { computeInvoiceLines } from "./compute/computeInvoiceLines";
import { evaluateStripeInvoicePlan } from "./evaluate/evaluateStripeInvoicePlan";
import { setupCreateInvoiceContext } from "./setup/setupCreateInvoiceContext";

/** Setup, compute and evaluate for a new invoice: everything up to execute. A preview writes nothing. */
export const planInvoice = async ({
	ctx,
	params,
	nowMs,
	preview,
	previewNewCustomer,
}: {
	ctx: AutumnContext;
	params: CreateInvoiceParams;
	nowMs: number;
	preview: boolean;
	previewNewCustomer?: boolean;
}) => {
	// 1. Setup
	const invoiceContext = await setupCreateInvoiceContext({
		ctx,
		params,
		preview,
		previewNewCustomer,
	});

	// 2. Compute Autumn lines
	const lines = computeInvoiceLines({ ctx, invoiceContext, nowMs });

	// 3. Evaluate the Stripe projection
	const stripePlan = evaluateStripeInvoicePlan({
		invoiceContext,
		lines,
		issueDateMs: params.issue_date ?? nowMs,
		dueDateMs: params.due_date ?? nowMs + ms.days(invoiceContext.daysUntilDue),
	});

	return { invoiceContext, lines, stripePlan };
};
