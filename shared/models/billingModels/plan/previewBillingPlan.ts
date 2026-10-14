import {
	PreviewInvoiceCreditsSchema,
	PreviewTaxSchema,
} from "@api/billing/common/billingPreviewResponse";
import { z } from "zod/v4";

export const PreviewBillingPlanSchema = z.object({
	tax: PreviewTaxSchema.optional(),
	invoiceCredits: PreviewInvoiceCreditsSchema.optional(),
});

export type PreviewBillingPlan = z.infer<typeof PreviewBillingPlanSchema>;
