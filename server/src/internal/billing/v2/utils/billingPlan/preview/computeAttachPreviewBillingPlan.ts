import type {
	AutumnBillingPlan,
	BillingContext,
	PreviewBillingPlan,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { computeAttachInvoiceCreditPreview } from "./invoiceCredits/computeAttachInvoiceCreditPreview";
import { computeAttachTaxPreview } from "./tax/computeAttachTaxPreview";
import { computeAttachTaxRateIdPreview } from "./tax/computeAttachTaxRateIdPreview";

/**
 * Build-stage orchestrator for preview-only enrichments. Originally
 * scoped to the attach flow (hence the name); now also drives previews
 * for `updateSubscription` and `multiAttach`. The helpers it composes
 * only read fields available on the parent `BillingContext`, so the
 * widened parameter type is type-safe across all preview callers.
 *
 * Rename to `computePreviewBillingPlan` is a follow-up.
 *
 * Invoked from action handlers ONLY when `preview: true`. Calls each
 * individual enrichment helper and assembles the `PreviewBillingPlan`
 * bag that lives at `billingPlan.preview`. New preview enrichments
 * (per-line tax breakdown, alt-currency previews, next-cycle tax, etc.)
 * slot in here as additional fields on `PreviewBillingPlan` + their own
 * helper module under `preview/`.
 */
export const computeAttachPreviewBillingPlan = async ({
	ctx,
	billingContext,
	autumnBillingPlan,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
	autumnBillingPlan: AutumnBillingPlan;
}): Promise<PreviewBillingPlan> => {
	// tax_rate_id overrides automatic_tax on the real Stripe subscription,
	// so we mirror that precedence here. The tax-rate-id branch is pure
	// math (rate was fetched at setup); the automatic_tax branch hits
	// Stripe Tax. Both produce the same `PreviewTax` shape.
	const taxPromise = billingContext.taxRateId
		? computeAttachTaxRateIdPreview({ ctx, billingContext, autumnBillingPlan })
		: computeAttachTaxPreview({ ctx, billingContext, autumnBillingPlan });

	const [tax, invoiceCredits] = await Promise.all([
		taxPromise,
		Promise.resolve(
			computeAttachInvoiceCreditPreview({ ctx, billingContext }),
		),
	]);

	return { tax, invoiceCredits };
};
