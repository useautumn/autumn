import { z } from "zod/v4";
import { CusProductLegacyDataSchema } from "./cusPlans/cusProductLegacyData";

export const CustomerLegacyDataSchema = z.object({
	cusProductLegacyData: z.record(z.string(), CusProductLegacyDataSchema),
});

export type CustomerLegacyData = z.infer<typeof CustomerLegacyDataSchema>;
