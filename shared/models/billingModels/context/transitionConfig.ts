import { z } from "zod/v4";

export const TransitionConfigSchema = z.object({
	feature_id: z.string(),
	reset_after_trial_end: z.boolean().default(false),
});

export type TransitionConfig = z.infer<typeof TransitionConfigSchema>;
