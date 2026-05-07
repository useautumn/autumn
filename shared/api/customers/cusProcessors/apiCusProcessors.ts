import { z } from "zod/v4";

export const ApiStripeProcessorSchema = z
	.object({
		id: z.string().meta({
			description: "Stripe customer ID.",
		}),
	})
	.meta({
		description: "Stripe processor connection for the customer.",
	});

export const ApiVercelProcessorSchema = z
	.object({
		installation_id: z.string().meta({
			description: "Vercel marketplace installation ID for this customer.",
		}),
		account_id: z.string().meta({
			description: "Vercel account ID associated with the installation.",
		}),
	})
	.meta({
		description:
			"Vercel processor connection for the customer (public-safe subset).",
	});

export const ApiRevenueCatProcessorSchema = z
	.object({
		id: z.string().nullable().meta({
			description:
				"Customer's external ID, used as the RevenueCat app user ID. Null if the customer has no external ID set.",
		}),
	})
	.meta({
		description: "RevenueCat processor connection for the customer.",
	});

export const ApiCusProcessorsSchema = z
	.object({
		stripe: ApiStripeProcessorSchema.optional(),
		vercel: ApiVercelProcessorSchema.optional(),
		revenuecat: ApiRevenueCatProcessorSchema.optional(),
	})
	.meta({
		description:
			"Payment processors this customer is connected to. Each sub-field is omitted when there is no signal for that processor.",
	});

export type ApiStripeProcessor = z.infer<typeof ApiStripeProcessorSchema>;
export type ApiVercelProcessor = z.infer<typeof ApiVercelProcessorSchema>;
export type ApiRevenueCatProcessor = z.infer<
	typeof ApiRevenueCatProcessorSchema
>;
export type ApiCusProcessors = z.infer<typeof ApiCusProcessorsSchema>;
