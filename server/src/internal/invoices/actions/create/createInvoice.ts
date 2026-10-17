import type {
	CreateInvoiceParams,
	CreateInvoicePreview,
	Invoice,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { checkRouteApproval } from "@/internal/approvals/check/checkRouteApproval";
import { buildCreateInvoiceFacts } from "@/internal/approvals/facts/invoices/buildCreateInvoiceFacts";
import { executeStripeInvoicePlan } from "./execute/executeStripeInvoicePlan";
import { planInvoice } from "./planInvoice";

export type CreateInvoiceResult = {
	invoice: Invoice | null;
	preview: CreateInvoicePreview;
};

/**
 * Bills catalog pricing and custom charges as a standalone send-invoice invoice.
 * Touches no customer product, balance or subscription.
 */
export const createInvoice = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: CreateInvoiceParams;
}): Promise<CreateInvoiceResult> => {
	const preview = params.preview === true;
	const nowMs = Date.now();

	if (preview) {
		const { stripePlan } = await planInvoice({ ctx, params, nowMs, preview });
		return { invoice: null, preview: stripePlan.preview };
	}

	// 1. Approvals: judged on a write-free preview, since setup creates or updates the customer
	await checkRouteApproval({
		ctx,
		action: "invoices.create",
		buildFacts: () => buildCreateInvoiceFacts({ ctx, params, nowMs }),
	});

	// 2. Setup, compute and evaluate
	const { invoiceContext, lines, stripePlan } = await planInvoice({
		ctx,
		params,
		nowMs,
		preview,
	});

	// 3. Execute
	const { invoice, issueDateMs, dueDateMs } = await executeStripeInvoicePlan({
		ctx,
		invoiceContext,
		lines,
		stripePlan,
	});

	return {
		invoice,
		preview: {
			...stripePlan.preview,
			issue_date: issueDateMs,
			due_date: dueDateMs,
		},
	};
};
