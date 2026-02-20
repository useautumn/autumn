import type { z } from "zod/v4";
import {
	BillingPreviewResponseSchema,
	ExtBillingPreviewResponseSchema,
} from "../common/billingPreviewResponse";

export const ExtPreviewUpdateSubscriptionResponseSchema =
	ExtBillingPreviewResponseSchema;

export const PreviewUpdateSubscriptionResponseSchema =
	BillingPreviewResponseSchema;

export type ExtPreviewUpdateSubscriptionResponse = z.infer<
	typeof ExtPreviewUpdateSubscriptionResponseSchema
>;
export type PreviewUpdateSubscriptionResponse = z.infer<
	typeof PreviewUpdateSubscriptionResponseSchema
>;
