import { z } from "zod/v4";
import { CusFeatureLegacyDataSchema } from "../customers/cusFeatures/cusFeatureLegacyData.js";
import { CusProductLegacyDataSchema } from "../customers/cusPlans/cusProductLegacyData.js";

export const EntityLegacyDataSchema = z.object({
	cusProductLegacyData: z.record(z.string(), CusProductLegacyDataSchema),
	cusFeatureLegacyData: z.record(z.string(), CusFeatureLegacyDataSchema),
});

export type EntityLegacyData = z.infer<typeof EntityLegacyDataSchema>;
