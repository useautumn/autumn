import type { z } from "zod/v4";
import { BillingPreviewResponseSchema } from "../common/billingPreviewResponse";

export const PreviewUpdateSubscriptionResponseSchema =
	BillingPreviewResponseSchema;

export type PreviewUpdateSubscriptionResponse = z.infer<
	typeof PreviewUpdateSubscriptionResponseSchema
>;
