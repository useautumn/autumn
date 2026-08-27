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

export const ApiPlanProcessorsSchema = z.object({
	stripe: ApiStripePlanProcessorSchema.optional(),
});

export const ApiPriceProcessorsSchema = z.object({
	stripe: ApiStripePriceProcessorSchema.optional(),
});

export type ApiStripePlanProcessor = z.infer<
	typeof ApiStripePlanProcessorSchema
>;
export type ApiStripePriceProcessor = z.infer<
	typeof ApiStripePriceProcessorSchema
>;
export type ApiPlanProcessors = z.infer<typeof ApiPlanProcessorsSchema>;
export type ApiPriceProcessors = z.infer<typeof ApiPriceProcessorsSchema>;
