import type {
	AttachBillingContext,
	AutumnBillingPlan,
	PreviewBillingPlan,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { computeAttachTaxPreview } from "./tax/computeAttachTaxPreview";

/**
 * Build-stage orchestrator for preview-only enrichments on the attach flow.
 *
 * Invoked from `attach.ts` ONLY when `preview: true`. Calls each individual
 * enrichment helper (currently just tax) and assembles the
 * `PreviewBillingPlan` bag that lives at `billingPlan.preview`.
 *
 * New preview enrichments (per-line tax breakdown, alt-currency previews,
 * next-cycle tax, etc.) slot in here as additional fields on
 * `PreviewBillingPlan` + their own helper module under `preview/`.
 */
export const computeAttachPreviewBillingPlan = async ({
	ctx,
	billingContext,
	autumnBillingPlan,
}: {
	ctx: AutumnContext;
	billingContext: AttachBillingContext;
	autumnBillingPlan: AutumnBillingPlan;
}): Promise<PreviewBillingPlan> => {
	const tax = await computeAttachTaxPreview({
		ctx,
		billingContext,
		autumnBillingPlan,
	});

	return { tax };
};
