import { z } from "zod/v4";
import { CusProductLegacyDataSchema } from "../customers/cusPlans/cusProductLegacyData.js";

export const EntityLegacyDataSchema = z.object({
	cusProductLegacyData: z.record(z.string(), CusProductLegacyDataSchema),
});

export type EntityLegacyData = z.infer<typeof EntityLegacyDataSchema>;
