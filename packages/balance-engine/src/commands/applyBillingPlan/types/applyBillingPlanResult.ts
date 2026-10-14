import { z } from "zod/v4";

export const applyBillingPlanResultSchema = z
	.object({ type: z.literal("applyBillingPlan") })
	.loose();

export type ApplyBillingPlanResult = z.infer<
	typeof applyBillingPlanResultSchema
>;
