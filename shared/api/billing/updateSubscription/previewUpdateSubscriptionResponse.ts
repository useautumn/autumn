import { BillingPreviewResponseSchema } from "@api/billing/common/billingPreviewResponse";
import type { z } from "zod/v4";

export const PreviewUpdateSubscriptionResponseSchema =
	BillingPreviewResponseSchema;

export type PreviewUpdateSubscriptionResponse = z.infer<
	typeof PreviewUpdateSubscriptionResponseSchema
>;
