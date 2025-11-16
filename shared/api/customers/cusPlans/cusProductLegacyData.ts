import { FeatureOptionsSchema } from "@models/cusProductModels/cusProductModels.js";
import { FeatureSchema } from "@models/featureModels/featureModels.js";
import { z } from "zod/v4";

export const CusProductLegacyDataSchema = z.object({
	subscription_id: z.string().optional(),
	options: z.array(FeatureOptionsSchema),
	features: z.array(FeatureSchema),
});

export type CusProductLegacyData = z.infer<typeof CusProductLegacyDataSchema>;
