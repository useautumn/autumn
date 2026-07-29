import { z } from "zod/v4";

/** Org-level default for `carry_over_usages`, inherited by attach and Stripe back-sync. */
export const TransitionRuleCarryOverUsagesSchema = z.object({
	enabled: z.boolean(),
	feature_ids: z.array(z.string()).optional(),
});

export type TransitionRuleCarryOverUsages = z.infer<
	typeof TransitionRuleCarryOverUsagesSchema
>;
