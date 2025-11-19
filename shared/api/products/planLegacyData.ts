import { z } from "zod/v4";
import { FeatureSchema } from "../../models/featureModels/featureModels.js";

export const PlanLegacyDataSchema = z.object({
	features: z.array(FeatureSchema),
});

export type PlanLegacyData = z.infer<typeof PlanLegacyDataSchema>;
