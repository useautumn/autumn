import { z } from "zod/v4";

export const FeatureQuantityParamsV0Schema = z
	.object({
		feature_id: z.string().meta({
			description: "The ID of the feature to set quantity for.",
		}),
		quantity: z.number().min(0, "quantity must be >= 0").optional().meta({
			description: "The quantity of the feature.",
		}),
		adjustable: z.boolean().optional().meta({
			description: "Whether the customer can adjust the quantity.",
		}),
	})
	.meta({
		title: "FeatureQuantity",
		description: "Quantity configuration for a prepaid feature.",
	});

export type FeatureQuantityParamsV0 = z.infer<
	typeof FeatureQuantityParamsV0Schema
>;
