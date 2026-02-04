import { z } from "zod/v4";

export const FeatureOptionsParamsV0Schema = z.object({
	feature_id: z.string(),
	quantity: z.number().optional(),

	reset_after_trial_end: z.boolean().default(false),
});

export type FeatureOptionsParamsV0 = z.infer<
	typeof FeatureOptionsParamsV0Schema
>;
