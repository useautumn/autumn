import { z } from "zod/v4";

export const TransitionConfigSchema = z.object({
	resetAfterTrialEndFeaturIds: z.array(z.string()).optional(),
});

export type TransitionConfig = z.infer<typeof TransitionConfigSchema>;
