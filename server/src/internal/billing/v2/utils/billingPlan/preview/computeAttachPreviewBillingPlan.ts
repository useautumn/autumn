import type {
	AutumnBillingPlan,
	BillingContext,
	PreviewBillingPlan,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { computeAttachInvoiceCreditPreview } from "./invoiceCredits/computeAttachInvoiceCreditPreview";
import { computeAttachTaxPreview } from "./tax/computeAttachTaxPreview";

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
	// Tax involves a Stripe round-trip; invoice-credits is local. Run in
	// parallel so the credits read doesn't add to the wall-clock latency.
	const [tax, invoiceCredits] = await Promise.all([
		computeAttachTaxPreview({ ctx, billingContext, autumnBillingPlan }),
		Promise.resolve(
			computeAttachInvoiceCreditPreview({ ctx, billingContext }),
		),
	]);

	return { tax, invoiceCredits };
};
