import type {
	AttachBillingContext,
	AutumnBillingPlan,
	PreviewTax,
} from "@autumn/shared";
import {
	atmnToStripeAmount,
	orgToCurrency,
	stripeToAtmnAmount,
} from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli";
import type { AutumnContext } from "@/honoUtils/HonoEnv";

/**
 * Build-stage helper that computes a tax preview for an attach via Stripe Tax.
 *
 * Read-only: calls `stripe.tax.calculations.create` (a non-mutating "what
 * would tax be" lookup). Output is consumed by the formatter, not the
 * executor — only ever populated when attach is invoked with `preview: true`.
 *
 * Skip-conditions (return undefined):
 *  - org has `automatic_tax: false`
 *  - flow is `stripe_checkout` (Stripe Checkout collects the address itself
 *    and computes tax during the buyer-facing form, so any pre-checkout
 *    preview here would diverge from what Stripe ultimately charges)
 *  - no Stripe customer exists (we only support previewing against an
 *    existing Stripe customer; Stripe's location waterfall needs it)
 *  - no `chargeImmediately` line items at all
 *
 * When the net taxable subtotal is `<= 0` (proration credits exceed new
 * charges), we short-circuit with `{ status: "complete", ...zeros }` —
 * Stripe Tax rejects non-positive line amounts and produces no tax on
 * net-credit invoices anyway, so this matches actual billing.
 *
 * Net-subtotal collapsing: we sum positive and negative `chargeImmediately`
 * line items into a single Stripe Tax line. Stripe Tax requires positive
 * line amounts (so we can't pass a -$10 unused-credit line directly), and
 * Stripe charges tax on the net invoice subtotal — not on positive lines
 * alone. Collapsing to one combined line yields the same total tax that
 * Stripe will actually invoice. If we ever need per-line `tax_code`
 * overrides we'll have to switch to proportional credit redistribution
 * across positive lines.
 *
 * Note: `autumn_checkout` is intentionally NOT skipped. It's a
 * confirmation-only flow — no address or payment method collection — so
 * the customer's existing Stripe address (and the resulting tax) is
 * exactly what gets charged on confirmation.
 *
 * On Stripe error → returns `{ status: "incomplete", ...zeros }` so the
 * merchant sees an explicit "tax not computed" signal in the preview rather
 * than a silently missing field.
 */
export const computeAttachTaxPreview = async ({
	ctx,
	billingContext,
	autumnBillingPlan,
}: {
	ctx: AutumnContext;
	billingContext: AttachBillingContext;
	autumnBillingPlan: AutumnBillingPlan;
}): Promise<PreviewTax | undefined> => {
	if (!ctx.org.config.automatic_tax) return undefined;
	if (billingContext.checkoutMode === "stripe_checkout") return undefined;
	if (!billingContext.stripeCustomer?.id) return undefined;

	const allLineItems = autumnBillingPlan.lineItems ?? [];
	if (allLineItems.length === 0) return undefined;

	const immediateLines = allLineItems.filter((line) => line.chargeImmediately);
	if (immediateLines.length === 0) return undefined;

	// Stripe charges tax on the net invoice subtotal — positives plus
	// negative proration credits — not on positive lines alone. Sum across
	// ALL chargeImmediately lines so the preview matches what Stripe
	// actually invoices.
	const netSubtotal = immediateLines.reduce(
		(sum, line) => sum + (line.amountAfterDiscounts ?? line.amount),
		0,
	);

	const currency = orgToCurrency({ org: ctx.org });
	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });

	// No tax owed when net subtotal is zero or negative (credit exceeds
	// charge). Stripe Tax rejects non-positive line amounts anyway, and
	// a credit invoice produces no tax in actual billing.
	if (netSubtotal <= 0) {
		return {
			total: 0,
			amount_inclusive: 0,
			amount_exclusive: 0,
			currency,
			status: "complete",
		};
	}

	try {
		const calc = await stripeCli.tax.calculations.create({
			currency,
			customer: billingContext.stripeCustomer.id,
			line_items: [
				{
					amount: atmnToStripeAmount({
						amount: netSubtotal,
						currency,
					}),
					reference: "preview_net_subtotal",
					quantity: 1,
				},
			],
		});

		return {
			total: stripeToAtmnAmount({
				amount:
					(calc.tax_amount_exclusive ?? 0) + (calc.tax_amount_inclusive ?? 0),
				currency,
			}),
			amount_inclusive: stripeToAtmnAmount({
				amount: calc.tax_amount_inclusive ?? 0,
				currency,
			}),
			amount_exclusive: stripeToAtmnAmount({
				amount: calc.tax_amount_exclusive ?? 0,
				currency,
			}),
			currency,
			status: "complete",
		};
	} catch (err) {
		const errMsg = (err as { message?: string })?.message ?? String(err);
		ctx.logger.warn(
			`[computeAttachTaxPreview] Stripe Tax calculation failed; returning incomplete status: ${errMsg}`,
		);
		return {
			total: 0,
			amount_inclusive: 0,
			amount_exclusive: 0,
			currency,
			status: "incomplete",
		};
	}
};
