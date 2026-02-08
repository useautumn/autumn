import { z } from "zod/v4";

export const FeatureQuantitySchema = z.object({
	feature_id: z.string(),
	quantity: z.number(),
});
