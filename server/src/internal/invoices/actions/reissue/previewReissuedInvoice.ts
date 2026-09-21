import type {
	CreateInvoicePreview,
	CreateInvoicePreviewLine,
	DbInvoiceLineItem,
	PreviewInvoiceCredits,
} from "@autumn/shared";
import { secondsToMs, stripeToAtmnAmount } from "@autumn/shared";
import { Decimal } from "decimal.js";
import type Stripe from "stripe";
import type { ExpandedStripeInvoiceLineItem } from "@/external/stripe/invoices/lineItems/operations/getStripeInvoiceLineItems";
import { applyInvoiceCredits } from "@/internal/billing/v2/utils/billingPlan/preview/invoiceCredits/applyInvoiceCredits";

const lineAmountAfterDiscounts = ({
	line,
	currency,
}: {
	line: ExpandedStripeInvoiceLineItem;
	currency: string;
}) =>
	stripeToAtmnAmount({
		amount:
			line.amount -
			(line.discount_amounts ?? []).reduce(
				(total, discount) => total + discount.amount,
				0,
			),
		currency,
	});

/**
 * What a reissued invoice looks like, read off a Stripe invoice and its lines.
 * Called with the original before anything is created, and with the finalized
 * replacement afterwards so the response describes what was actually issued.
 */
export const previewReissuedInvoice = ({
	stripeInvoice,
	lines,
	storedLines,
	credits,
	dueDateMs,
	settled = false,
}: {
	stripeInvoice: Stripe.Invoice;
	lines: ExpandedStripeInvoiceLineItem[];
	/** Autumn's rows for the original, which carry the plan and feature. */
	storedLines: DbInvoiceLineItem[];
	credits?: PreviewInvoiceCredits;
	dueDateMs: number | null;
	/** The invoice is finalized, so its own balance figures are the truth. */
	settled?: boolean;
}): CreateInvoicePreview => {
	const currency = stripeInvoice.currency;
	const storedByStripeId = new Map(
		storedLines
			.filter((stored) => stored.stripe_id)
			.map((stored) => [stored.stripe_id as string, stored]),
	);

	const previewLines: CreateInvoicePreviewLine[] = lines.map((line) => {
		const amount = lineAmountAfterDiscounts({ line, currency });
		// A replacement line carries the id of the original line it came from.
		const sourceLineId =
			(line.metadata?.autumn_reissued_from_line as string | undefined) ??
			line.id;
		const stored = storedByStripeId.get(sourceLineId);
		return {
			plan_id: stored?.product_id ?? line.metadata?.autumn_product_id ?? null,
			feature_id: stored?.feature_id ?? null,
			description: line.description ?? "",
			amount,
			amount_after_discounts: amount,
			quantity: line.quantity ?? null,
			prorated: false,
			period_start: line.period ? secondsToMs(line.period.start) : null,
			period_end: line.period ? secondsToMs(line.period.end) : null,
		};
	});

	const subtotal = stripeToAtmnAmount({
		amount: stripeInvoice.subtotal,
		currency,
	});
	const total = stripeToAtmnAmount({ amount: stripeInvoice.total, currency });
	const taxTotal = (stripeInvoice.total_taxes ?? []).reduce(
		(sum, tax) => sum + tax.amount,
		0,
	);
	// Stripe records the credit it consumed as a negative starting_balance.
	const { credits: appliedCredits, amountDue } = settled
		? {
				credits: credits
					? {
							...credits,
							applied: stripeToAtmnAmount({
								amount: Math.max(-(stripeInvoice.starting_balance ?? 0), 0),
								currency,
							}),
						}
					: undefined,
				amountDue: stripeToAtmnAmount({
					amount: stripeInvoice.amount_due,
					currency,
				}),
			}
		: applyInvoiceCredits({ total, credits });

	return {
		currency,
		lines: previewLines,
		subtotal,
		discount_total: new Decimal(subtotal)
			.minus(total)
			.plus(stripeToAtmnAmount({ amount: taxTotal, currency }))
			.toDP(2)
			.toNumber(),
		tax: taxTotal
			? {
					total: stripeToAtmnAmount({ amount: taxTotal, currency }),
					amount_inclusive: 0,
					amount_exclusive: stripeToAtmnAmount({
						amount: taxTotal,
						currency,
					}),
					status: "complete" as const,
				}
			: null,
		total,
		invoice_credits: appliedCredits,
		amount_due: amountDue,
		due_date: dueDateMs,
	};
};
