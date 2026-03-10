import { z } from "zod/v4";
import {
	BillingPreviewResponseSchema,
	ExtBillingPreviewResponseSchema,
} from "../common/billingPreviewResponse";

export enum UpdateSubscriptionPreviewIntent {
	UpdatePlan = "update_plan",
	UpdateQuantity = "update_quantity",
	CancelImmediately = "cancel_immediately",
	CancelEndOfCycle = "cancel_end_of_cycle",
	Uncancel = "uncancel",
	None = "none",
}

export const ExtPreviewUpdateSubscriptionResponseSchema =
	ExtBillingPreviewResponseSchema.extend({
		intent: z.nativeEnum(UpdateSubscriptionPreviewIntent),
	});

export const PreviewUpdateSubscriptionResponseSchema =
	BillingPreviewResponseSchema.extend({
		object: z.literal("update_subscription_preview").meta({ internal: true }),
		intent: z.nativeEnum(UpdateSubscriptionPreviewIntent),
	});

export type ExtPreviewUpdateSubscriptionResponse = z.infer<
	typeof ExtPreviewUpdateSubscriptionResponseSchema
>;
export type PreviewUpdateSubscriptionResponse = z.infer<
	typeof PreviewUpdateSubscriptionResponseSchema
>;
