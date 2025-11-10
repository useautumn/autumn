import { z } from "zod/v4";

// Base schema without top-level .meta() to avoid side effects during imports
// Individual field descriptions are kept as they don't cause registry conflicts
export const CustomerDataSchema = z
	.object({
		name: z.string().nullish().meta({
			description: "Customer's name",
		}),
		email: z.string().nullish().meta({
			description: "Customer's email address",
		}),
		fingerprint: z.string().nullish().meta({
			description:
				"Unique identifier (eg, serial number) to detect duplicate customers and prevent free trial abuse",
		}),
		metadata: z.record(z.any(), z.any()).nullish().meta({
			description: "Additional metadata for the customer",
		}),
		stripe_id: z.string().nullish().meta({
			description: "Stripe customer ID if you already have one",
		}),
		disable_default: z.boolean().optional().meta({
			description:
				"Disable default products from being attached to the customer",
		}),
	})
	.meta({
		id: "CustomerData",
		description:
			"Used to add customer details like name or email when auto-creating a customer.",
	});

export type CustomerData = z.infer<typeof CustomerDataSchema>;
