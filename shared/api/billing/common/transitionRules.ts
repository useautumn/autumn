import { z } from "zod/v4";
export const TransitionRulesSchema = z
	.object({
		reset_after_trial_end: z.array(z.string()).meta({
			description: "Feature IDs to reset when the trial ends.",
		}),
	})
	.meta({
		title: "TransitionRules",
		description: "Rules for handling plan transitions.",
	});

export type TransitionRules = z.infer<typeof TransitionRulesSchema>;
