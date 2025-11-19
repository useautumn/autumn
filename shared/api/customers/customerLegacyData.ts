import { z } from "zod/v4";
import { CusFeatureLegacyDataSchema } from "./cusFeatures/cusFeatureLegacyData.js";
import { CusProductLegacyDataSchema } from "./cusPlans/cusProductLegacyData.js";

export const CustomerLegacyDataSchema = z.object({
	cusProductLegacyData: z.record(z.string(), CusProductLegacyDataSchema),
	cusFeatureLegacyData: z.record(z.string(), CusFeatureLegacyDataSchema),
});

export type CustomerLegacyData = z.infer<typeof CustomerLegacyDataSchema>;
