import { z } from "zod/v4";

export const ApiPlanFeatureSchema = z.object({
	feature_id: z.string(),
});

export type ApiPlanFeature = z.infer<typeof ApiPlanFeatureSchema>;
