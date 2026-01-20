import { z } from "zod/v4";
import { ExternalProcessorsSchema } from "../../models/genModels/processorSchemas.js";

// Base schema without top-level .meta() to avoid side effects during imports
// Individual field descriptions are kept as they don't cause registry conflicts
export const CustomerDataSchema = z
	.object({
		name: z.string().nullish().meta({
			description: "Customer's name",
		}),
		email: z.email({ message: "not a valid email address" }).nullish().meta({
			description: "Customer's email address",
		}),
		fingerprint: z.string().nullish().meta({
			description:
				"Unique identifier (eg, serial number) to detect duplicate customers and prevent free trial abuse",
		}),
		metadata: z.record(z.string(), z.any()).nullish().meta({
			description: "Additional metadata for the customer",
		}),
		stripe_id: z.string().nullish().meta({
			description: "Stripe customer ID if you already have one",
		}),

		processors: ExternalProcessorsSchema.nullish().meta({
			internal: true,
			description: "External processors for the customer",
		}),
	})
	.meta({
		id: "CustomerData",
		description: "Customer details to set when creating a customer",
	});

// for internal use only
export const CreateCustomerInternalOptionsSchema = z.object({
	default_group: z.string().optional().meta({
		description: "The group of products to attach to the customer",
	}),
	disable_defaults: z.boolean().optional().meta({
		description: "Whether to disable default products",
	}),
});

export type CustomerData = z.infer<typeof CustomerDataSchema>;
export type CreateCustomerInternalOptions = z.infer<
	typeof CreateCustomerInternalOptionsSchema
>;
