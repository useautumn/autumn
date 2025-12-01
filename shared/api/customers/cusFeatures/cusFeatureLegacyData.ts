import { z } from "zod/v4";

export const CusFeatureLegacyDataSchema = z.object({
	prepaid_quantity: z.number(),
	breakdown_legacy_data: z.array(
		z.object({
			key: z.string(),
			prepaid_quantity: z.number(),
		}),
	),
});

export type CusFeatureLegacyData = z.infer<typeof CusFeatureLegacyDataSchema>;
