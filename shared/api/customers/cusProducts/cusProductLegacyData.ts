import { z } from "zod/v4";

export const CusProductLegacyDataSchema = z.object({
	subscription_id: z.string().optional(),
});

export type CusProductLegacyData = z.infer<typeof CusProductLegacyDataSchema>;
