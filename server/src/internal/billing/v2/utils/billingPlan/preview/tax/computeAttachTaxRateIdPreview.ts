import type {
	AutumnBillingPlan,
	BillingContext,
	PreviewTax,
} from "@autumn/shared";
import {
	atmnToStripeAmount,
	orgToCurrency,
	stripeToAtmnAmount,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";

/**
 * Build-stage helper that computes a tax preview for an attach when the
 * caller passed an explicit Stripe `tax_rate_id`. Sibling to
 * `computeAttachTaxPreview` (which handles automatic_tax).
 *
 * Pure math: the Stripe TaxRate was fetched once at setup and lives on
 * `billingContext.stripeTaxRate`. Tax is applied to the same net
 * `chargeImmediately` subtotal the automatic-tax helper uses, so both
 * branches feed the formatter and total-assembly identically.
 *
 * Skip-conditions (return undefined):
 *  - no `taxRateId` on context
 *  - flow is `stripe_checkout` (Stripe Checkout computes tax itself, same
 *    reasoning as the automatic-tax helper)
 *  - no `chargeImmediately` line items
 *
 * On `netSubtotal <= 0` we short-circuit with `{ status: "complete", ...zeros }` —
 * tax does not apply to a credit invoice.
 *
 * On a missing/expanded `stripeTaxRate` (fetch failed at setup) we return
 * `{ status: "incomplete", ...zeros }` so the merchant sees an explicit
 * "tax not computed" signal rather than a silently missing field.
 */
export const computeAttachTaxRateIdPreview = async ({
	ctx,
	billingContext,
	autumnBillingPlan,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
	autumnBillingPlan: AutumnBillingPlan;
}): Promise<PreviewTax | undefined> => {
	if (!billingContext.taxRateId) return undefined;
	if (billingContext.checkoutMode === "stripe_checkout") return undefined;

	const allLineItems = autumnBillingPlan.lineItems ?? [];
	if (allLineItems.length === 0) return undefined;

	const immediateLines = allLineItems.filter((line) => line.chargeImmediately);
	if (immediateLines.length === 0) return undefined;

	const netSubtotal = immediateLines.reduce(
		(sum, line) => sum + (line.amountAfterDiscounts ?? line.amount),
		0,
	);

	const currency = orgToCurrency({ org: ctx.org });

	if (netSubtotal <= 0) {
		return {
			total: 0,
			amount_inclusive: 0,
			amount_exclusive: 0,
			currency,
			status: "complete",
		};
	}

	const taxRate = billingContext.stripeTaxRate;
	if (!taxRate) {
		ctx.logger.warn(
			`[computeAttachTaxRateIdPreview] stripeTaxRate missing on billing context for taxRateId=${billingContext.taxRateId}; returning incomplete`,
		);
		return {
			total: 0,
			amount_inclusive: 0,
			amount_exclusive: 0,
			currency,
			status: "incomplete",
		};
	}

	// Round through Stripe minor-units to match how Stripe rounds tax on
	// the real invoice (per-line rounding to the nearest cent).
	const subtotalMinorUnits = atmnToStripeAmount({
		amount: netSubtotal,
		currency,
	});

	const taxMinorUnits = taxRate.inclusive
		? Math.round(
				(subtotalMinorUnits * taxRate.percentage) / (100 + taxRate.percentage),
			)
		: Math.round((subtotalMinorUnits * taxRate.percentage) / 100);

	const taxAmount = stripeToAtmnAmount({ amount: taxMinorUnits, currency });

	// For an inclusive rate the line amount already contains the tax, so
	// Stripe charges only the line amount. `total` drives
	// applyPreviewAdjustmentsToTotal and must stay 0 here to avoid inflating
	// preview.total. `amount_inclusive` still reports the notional split.
	return {
		total: taxRate.inclusive ? 0 : taxAmount,
		amount_inclusive: taxRate.inclusive ? taxAmount : 0,
		amount_exclusive: taxRate.inclusive ? 0 : taxAmount,
		currency,
		status: "complete",
	};
};
