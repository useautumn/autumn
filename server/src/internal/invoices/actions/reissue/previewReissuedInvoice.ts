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
 * What the replacement invoice will look like, computed from the original's
 * lines without creating anything. A reissue reproduces the original, so its
 * tax and totals carry over unchanged.
 */
export const previewReissuedInvoice = ({
	stripeInvoice,
	lines,
	storedLines,
	credits,
	dueDateMs,
}: {
	stripeInvoice: Stripe.Invoice;
	lines: ExpandedStripeInvoiceLineItem[];
	/** Autumn's rows for the original, which carry the plan and feature. */
	storedLines: DbInvoiceLineItem[];
	credits?: PreviewInvoiceCredits;
	dueDateMs: number | null;
}): CreateInvoicePreview => {
	const currency = stripeInvoice.currency;
	const storedByStripeId = new Map(
		storedLines
			.filter((stored) => stored.stripe_id)
			.map((stored) => [stored.stripe_id as string, stored]),
	);

	const previewLines: CreateInvoicePreviewLine[] = lines.map((line) => {
		const amount = lineAmountAfterDiscounts({ line, currency });
		const stored = storedByStripeId.get(line.id);
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
	const { credits: appliedCredits, amountDue } = applyInvoiceCredits({
		total,
		credits,
	});

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
