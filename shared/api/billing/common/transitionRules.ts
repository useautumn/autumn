import { z } from "zod/v4";
export const TransitionRulesSchema = z.object({
	reset_after_trial_end: z.array(z.string()), // feature IDs
});

export type TransitionRules = z.infer<typeof TransitionRulesSchema>;
