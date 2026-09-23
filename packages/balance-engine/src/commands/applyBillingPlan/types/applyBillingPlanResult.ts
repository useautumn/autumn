import { z } from "zod/v4";

/** Loose: a future worker may add fields; an older one replaying the log ignores them. */
export const applyBillingPlanResultSchema = z
	.object({ type: z.literal("applyBillingPlan") })
	.loose();

export type ApplyBillingPlanResult = z.infer<
	typeof applyBillingPlanResultSchema
>;
