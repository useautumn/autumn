import { z } from "zod/v4";

export const FeatureQuantityParamsV0Schema = z.object({
	feature_id: z.string(),
	quantity: z.number().min(0, "quantity must be >= 0").optional(),
	adjustable: z.boolean().optional(),
});

export type FeatureQuantityParamsV0 = z.infer<
	typeof FeatureQuantityParamsV0Schema
>;
