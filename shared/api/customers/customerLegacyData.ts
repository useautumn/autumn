import { z } from "zod/v4";
import { CusProductLegacyDataSchema } from "./cusProducts/cusProductLegacyData.js";

export const CustomerLegacyDataSchema = z.object({
	cusProductLegacyData: z.record(z.string(), CusProductLegacyDataSchema),
});

export type CustomerLegacyData = z.infer<typeof CustomerLegacyDataSchema>;
