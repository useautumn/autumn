import { z } from "zod/v4";

export const CusFeatureLegacyDataSchema = z.object({
	prepaid_quantity: z.number(),
});

export type CusFeatureLegacyData = z.infer<typeof CusFeatureLegacyDataSchema>;
