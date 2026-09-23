import type {
	DbInvoiceLineItem,
	ReissueInvoiceOverrides,
	ReissueLineEdits,
} from "@autumn/shared";
import type Stripe from "stripe";
import { getStripeInvoiceLineItems } from "@/external/stripe/invoices/lineItems/operations/getStripeInvoiceLineItems";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { applyReissueLineEdits } from "./applyReissueLineEdits";
import { resolveReissueTax } from "./resolveReissueTax";

export const buildReissueLines = async ({
	ctx,
	customerId,
	stripeCli,
	stripeInvoice,
	overrides,
	lineEdits,
	storedLines,
}: {
	ctx: AutumnContext;
	customerId: string;
	stripeCli: Stripe;
	stripeInvoice: Stripe.Invoice;
	overrides?: ReissueInvoiceOverrides;
	lineEdits?: ReissueLineEdits;
	storedLines: DbInvoiceLineItem[];
}): Promise<Stripe.InvoiceAddLinesParams.Line[]> => {
	const { lineTaxRates } = resolveReissueTax({ stripeInvoice, overrides });
	const sourceLines = await getStripeInvoiceLineItems({
		stripeClient: stripeCli,
		invoiceId: stripeInvoice.id,
	});
	return applyReissueLineEdits({
		ctx,
		customerId,
		storedLines,
		edits: lineEdits,
		currency: stripeInvoice.currency,
		lines: sourceLines.map((line) => ({
			description: line.description ?? undefined,
			amount:
				line.amount -
				(line.discount_amounts ?? []).reduce(
					(total, discount) => total + discount.amount,
					0,
				),
			discountable: false,
			period: line.period
				? { start: line.period.start, end: line.period.end }
				: undefined,
			tax_rates:
				lineTaxRates === "none"
					? ""
					: lineTaxRates === "keep" && line.taxes?.length
						? line.taxes.flatMap((tax) =>
								tax.tax_rate_details?.tax_rate
									? [tax.tax_rate_details.tax_rate]
									: [],
							)
						: undefined,
			metadata: {
				...(line.metadata ?? {}),
				autumn_reissued_from_line: line.id,
			},
		})),
	});
};
