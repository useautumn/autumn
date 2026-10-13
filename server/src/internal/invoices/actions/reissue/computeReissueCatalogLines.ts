import type {
	CreateInvoiceParams,
	InvoicePlanParams,
	LineItem,
} from "@autumn/shared";
import type Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { computeInvoiceLines } from "../create/compute/computeInvoiceLines";
import { evaluateStripeInvoicePlan } from "../create/evaluate/evaluateStripeInvoicePlan";
import { setupCreateInvoiceContext } from "../create/setup/setupCreateInvoiceContext";

/**
 * Prices catalog plans added to a reissue exactly as invoices.create would, so
 * the same plan costs the same whichever endpoint bills it and its lines carry
 * the metadata that ties them back to the Autumn product and price.
 */
export const computeReissueCatalogLines = async ({
	ctx,
	customerId,
	currency,
	plans,
}: {
	ctx: AutumnContext;
	customerId: string;
	currency: string;
	plans: InvoicePlanParams[];
}): Promise<{
	lines: Stripe.InvoiceAddLinesParams.Line[];
	/** The Autumn lines behind them, so the replacement's stored rows keep plan, feature and entity. */
	lineItems: LineItem[];
}> => {
	if (plans.length === 0) return { lines: [], lineItems: [] };

	const params: CreateInvoiceParams = {
		customer_id: customerId,
		currency,
		plans,
	} as CreateInvoiceParams;

	const invoiceContext = await setupCreateInvoiceContext({
		ctx,
		params,
		preview: true,
	});
	const invoiceLines = computeInvoiceLines({ ctx, invoiceContext });
	const { lines } = evaluateStripeInvoicePlan({
		invoiceContext,
		lines: invoiceLines,
		issueDateMs: Date.now(),
		dueDateMs: null,
	});
	return { lines, lineItems: invoiceLines.map((line) => line.lineItem) };
};
