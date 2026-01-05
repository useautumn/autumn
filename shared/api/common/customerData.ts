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
			internal: true,
		}),
		metadata: z.record(z.any(), z.any()).nullish().meta({
			internal: true,
		}),
		stripe_id: z.string().nullish().meta({
			internal: true,
		}),
		disable_default: z.boolean().optional().meta({
			internal: true,
		}),
	})
	.meta({
		id: "CustomerData",
		description: "Customer details to set when creating a customer",
	});

export type CustomerData = z.infer<typeof CustomerDataSchema>;
