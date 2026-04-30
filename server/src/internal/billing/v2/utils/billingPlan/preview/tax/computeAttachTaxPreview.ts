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
 *  - flow is `stripe_checkout` or `autumn_checkout` (the buyer-facing form
 *    may collect/update the address, so a pre-checkout tax preview risks
 *    diverging from what Stripe charges at checkout)
 *  - no Stripe customer exists (we only support previewing against an
 *    existing Stripe customer; Stripe's location waterfall needs it)
 *  - nothing positive to charge immediately (no taxable subtotal)
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
	if (
		billingContext.checkoutMode === "stripe_checkout" ||
		billingContext.checkoutMode === "autumn_checkout"
	) {
		return undefined;
	}
	if (!billingContext.stripeCustomer?.id) return undefined;

	const allLineItems = autumnBillingPlan.lineItems ?? [];
	if (allLineItems.length === 0) return undefined;

	const taxableLines = allLineItems.filter((line) => {
		const net = line.amountAfterDiscounts ?? line.amount;
		return line.chargeImmediately && net > 0;
	});
	if (taxableLines.length === 0) return undefined;

	const currency = orgToCurrency({ org: ctx.org });
	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });

	try {
		const calc = await stripeCli.tax.calculations.create({
			currency,
			customer: billingContext.stripeCustomer.id,
			line_items: taxableLines.map((line, idx) => ({
				amount: atmnToStripeAmount({
					amount: line.amountAfterDiscounts ?? line.amount,
					currency,
				}),
				reference: line.id || `li_${idx}`,
				quantity: 1,
			})),
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
