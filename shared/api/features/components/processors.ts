import { z } from "zod/v4";

/** Stripe connection on a feature — the shared Product and optional Meter. */
export const ApiStripeFeatureProcessorSchema = z.object({
	product_id: z.string().optional().meta({
		description: "Stripe product ID this feature's usage prices bill under.",
	}),
	meter_id: z.string().optional().meta({
		description: "Stripe meter ID used to create this feature's metered price.",
	}),
});

export const ApiFeatureProcessorsSchema = z.object({
	stripe: ApiStripeFeatureProcessorSchema.optional(),
});

export type ApiStripeFeatureProcessor = z.infer<
	typeof ApiStripeFeatureProcessorSchema
>;
export type ApiFeatureProcessors = z.infer<typeof ApiFeatureProcessorsSchema>;
