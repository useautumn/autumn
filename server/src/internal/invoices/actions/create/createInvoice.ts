import type {
	CreateInvoiceParams,
	CreateInvoicePreview,
	Invoice,
} from "@autumn/shared";
import { ms } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { computeInvoiceLines } from "./compute/computeInvoiceLines";
import { evaluateStripeInvoicePlan } from "./evaluate/evaluateStripeInvoicePlan";
import { executeStripeInvoicePlan } from "./execute/executeStripeInvoicePlan";
import { setupCreateInvoiceContext } from "./setup/setupCreateInvoiceContext";

export type CreateInvoiceResult = {
	invoice: Invoice | null;
	preview: CreateInvoicePreview;
};

export const createInvoice = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: CreateInvoiceParams;
}): Promise<CreateInvoiceResult> => {
	const preview = params.preview === true;
	const nowMs = Date.now();

	const invoiceContext = await setupCreateInvoiceContext({
		ctx,
		params,
		preview,
	});

	const lines = computeInvoiceLines({ ctx, invoiceContext, nowMs });

	const stripePlan = evaluateStripeInvoicePlan({
		invoiceContext,
		lines,
		issueDateMs: params.issue_date ?? nowMs,
		dueDateMs: params.due_date ?? nowMs + ms.days(invoiceContext.daysUntilDue),
	});

	if (preview) return { invoice: null, preview: stripePlan.preview };

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
