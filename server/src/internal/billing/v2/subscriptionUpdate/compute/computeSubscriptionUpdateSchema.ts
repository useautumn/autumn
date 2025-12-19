import { z } from "zod/v4";

/**
 * The intent for a subscription update
 */
export enum SubscriptionUpdateIntentEnum {
	UpdateQuantity = "update_quantity",
	UpdatePlan = "update_plan",
}

export const ComputeSubscriptionUpdateResultSchema = z.object({
	intent: SubscriptionUpdateIntentEnum,
});

export type ComputeSubscriptionUpdateResult = z.infer<
	typeof ComputeSubscriptionUpdateResultSchema
>;
