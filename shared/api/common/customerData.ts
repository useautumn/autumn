import { z } from "zod/v4";

// Base schema without top-level .meta() to avoid side effects during imports
// Individual field descriptions are kept as they don't cause registry conflicts
export const CustomerDataSchema = z.object({
	name: z.string().nullish().meta({
		description: "Customer's name",
		example: "John Doe",
	}),
	email: z.string().nullish().meta({
		description: "Customer's email address",
		example: "john@example.com",
	}),
	fingerprint: z.string().nullish().meta({
		description:
			"Unique identifier (eg, serial number) to detect duplicate customers and prevent free trial abuse",
		example: "fp_123abc",
	}),
	metadata: z
		.record(z.any(), z.any())
		.nullish()
		.meta({
			description: "Additional metadata for the customer",
			example: { company: "Acme Inc" },
		}),
	stripe_id: z.string().nullish().meta({
		description: "Stripe customer ID if you already have one",
		example: "cus_stripe123",
	}),
});

export type CustomerData = z.infer<typeof CustomerDataSchema>;
