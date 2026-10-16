import type {
	CreateInvoiceParams,
	CreateInvoicePreview,
	Invoice,
} from "@autumn/shared";
import { ms } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { checkRouteApproval } from "@/internal/approvals/enforce/checkRouteApproval";
import { createInvoicePreviewToFacts } from "@/internal/approvals/facts/invoices/createInvoicePreviewToFacts";
import { computeInvoiceLines } from "./compute/computeInvoiceLines";
import { evaluateStripeInvoicePlan } from "./evaluate/evaluateStripeInvoicePlan";
import { executeStripeInvoicePlan } from "./execute/executeStripeInvoicePlan";
import { setupCreateInvoiceContext } from "./setup/setupCreateInvoiceContext";

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

	const planInvoice = async ({
		preview,
		previewNewCustomer,
	}: {
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
			dueDateMs:
				params.due_date ?? nowMs + ms.days(invoiceContext.daysUntilDue),
		});
		return { invoiceContext, lines, stripePlan };
	};

	if (preview) {
		const { stripePlan } = await planInvoice({ preview: true });
		return { invoice: null, preview: stripePlan.preview };
	}

	// 4. Approvals: judged on a write-free preview, since setup creates or updates the customer
	await checkRouteApproval({
		ctx,
		action: "invoices.create",
		buildFacts: async () => {
			const { invoiceContext, stripePlan } = await planInvoice({
				preview: true,
				previewNewCustomer: true,
			});
			return createInvoicePreviewToFacts({
				fullCustomer: invoiceContext.fullCustomer,
				preview: stripePlan.preview,
			});
		},
	});

	const { invoiceContext, lines, stripePlan } = await planInvoice({
		preview: false,
	});

	// 5. Execute
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
