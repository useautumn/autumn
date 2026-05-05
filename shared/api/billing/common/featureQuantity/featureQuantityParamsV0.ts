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
		stripe_price_id: z.string().optional().meta({
			description:
				"Stripe price id this prepaid feature is billed under. Set by sync flows when the Stripe sub references a price different from the catalog default.",
			internal: true,
		}),
	})
	.meta({
		title: "FeatureQuantity",
		description: "Quantity configuration for a prepaid feature.",
	});

export type FeatureQuantityParamsV0 = z.infer<
	typeof FeatureQuantityParamsV0Schema
>;
