import { z } from "zod/v4";

export const TransitionRuleCarryOverUsagesSchema = z.object({
	enabled: z.boolean(),
	feature_ids: z.array(z.string()).optional(),
});

export type TransitionRuleCarryOverUsages = z.infer<
	typeof TransitionRuleCarryOverUsagesSchema
>;
