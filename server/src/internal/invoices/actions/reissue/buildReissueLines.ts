import {
	type DbInvoiceLineItem,
	ErrCode,
	RecaseError,
	type ReissueInvoiceOverrides,
	type ReissueLineEdits,
} from "@autumn/shared";
import type Stripe from "stripe";
import {
	type ExpandedStripeInvoiceLineItem,
	getStripeInvoiceLineItems,
} from "@/external/stripe/invoices/lineItems/operations/getStripeInvoiceLineItems";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { applyReissueLineEdits } from "./applyReissueLineEdits";
import { resolveReissueTax } from "./resolveReissueTax";

/**
 * Stripe hides $0 zero-quantity lines (zero-usage metered placeholders) on the
 * hosted invoice and PDF. Copied as price-less items they'd become visible
 * "0 × ..." lines with quantity 1, so they're dropped unless an edit reprices
 * them.
 */
const isHiddenSourceLine = (line: ExpandedStripeInvoiceLineItem) =>
	line.amount === 0 && line.quantity === 0;

/** Stripe line ids that the request's `update` edits target. */
const updatedStripeLineIds = ({
	storedLines,
	lineEdits,
}: {
	storedLines: DbInvoiceLineItem[];
	lineEdits?: ReissueLineEdits;
}) => {
	const updatedIds = new Set(
		(lineEdits?.update ?? []).map((update) => update.id),
	);
	return new Set(
		storedLines.flatMap((line) =>
			updatedIds.has(line.id) && line.stripe_id ? [line.stripe_id] : [],
		),
	);
};

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
	const repricedLineIds = updatedStripeLineIds({ storedLines, lineEdits });
	const keptSourceLines = sourceLines.filter(
		(line) => !isHiddenSourceLine(line) || repricedLineIds.has(line.id),
	);
	const lines = await applyReissueLineEdits({
		ctx,
		customerId,
		storedLines,
		edits: lineEdits,
		currency: stripeInvoice.currency,
		lines: keptSourceLines.map((line) => ({
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
	if (lines.length > 250) {
		throw new RecaseError({
			message: "Stripe replacement invoices support at most 250 line items",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
	return lines;
};
