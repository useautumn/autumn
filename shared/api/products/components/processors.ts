import { z } from "zod/v4";

/** Stripe connection on a plan — the Stripe Product. */
export const ApiStripePlanProcessorSchema = z.object({
	product_id: z.string().meta({
		description: "Stripe product ID this plan is billed under.",
	}),
	additional_product_ids: z.array(z.string()).optional().meta({
		description: "Extra Stripe product IDs aliased to this plan.",
	}),
});

/** Stripe connection on a price — the Stripe Price. Product is inferred from it. */
export const ApiStripePriceProcessorSchema = z.object({
	price_id: z.string().meta({
		description:
			"Stripe price ID. For prepaid with included > 0 this is the V2 price.",
	}),
});

/**
 * RevenueCat sells quantity as separate store products, so many RC ids map to
 * one Autumn plan and each carries the grant it represents.
 */
export const ApiRevenueCatProductSchema = z.object({
	product_id: z.string().meta({
		description: "RevenueCat product ID that grants this plan when purchased.",
	}),
	feature_quantities: z
		.array(
			z.object({
				feature_id: z.string(),
				quantity: z.number().nonnegative().optional(),
			}),
		)
		.optional()
		.meta({
			description:
				"Prepaid quantities granted when this specific RevenueCat product is purchased, in feature units.",
		}),
});

export const ApiRevenueCatPlanProcessorSchema = z.object({
	products: z.array(ApiRevenueCatProductSchema).meta({
		description:
			"Every RevenueCat product that maps to this plan. Replaces the current set.",
	}),
});

export const ApiPlanProcessorsSchema = z.object({
	/** Omit to keep the current mapping; null unlinks it. */
	stripe: ApiStripePlanProcessorSchema.nullish(),
	revenuecat: ApiRevenueCatPlanProcessorSchema.nullish(),
});

export const ApiPriceProcessorsSchema = z.object({
	/** Omit to keep the current mapping; null unlinks it. */
	stripe: ApiStripePriceProcessorSchema.nullish(),
});

export type ApiStripePlanProcessor = z.infer<
	typeof ApiStripePlanProcessorSchema
>;
export type ApiStripePriceProcessor = z.infer<
	typeof ApiStripePriceProcessorSchema
>;
export type ApiPlanProcessors = z.infer<typeof ApiPlanProcessorsSchema>;
export type ApiPriceProcessors = z.infer<typeof ApiPriceProcessorsSchema>;

export type ApiRevenueCatProduct = z.infer<typeof ApiRevenueCatProductSchema>;
export type ApiRevenueCatPlanProcessor = z.infer<
	typeof ApiRevenueCatPlanProcessorSchema
>;
