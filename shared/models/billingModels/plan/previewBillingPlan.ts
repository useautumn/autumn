import { PreviewTaxSchema } from "@api/billing/common/billingPreviewResponse";
import { z } from "zod/v4";

/**
 * Preview-only enrichments populated when a build is requested in preview mode.
 * Lives on `BillingPlan.preview` alongside `autumn` (autumn plan) and `stripe`
 * (stripe action plan). Each field is computed by a dedicated build-stage
 * helper in `server/src/internal/billing/v2/utils/billingPlan/preview/...`.
 *
 * Never populated outside the preview flow — execute paths never see this.
 */
export const PreviewBillingPlanSchema = z.object({
	tax: PreviewTaxSchema.optional(),
});

export type PreviewBillingPlan = z.infer<typeof PreviewBillingPlanSchema>;
