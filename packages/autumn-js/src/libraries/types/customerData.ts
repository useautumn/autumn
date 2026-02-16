import { z } from "zod/v4";

/**
 * Customer data accepted by autumn-js create/update flows.
 */
export const CustomerDataSchema = z
	.object({
		name: z.string().nullable().optional().describe("Customer name."),
		email: z.string().nullable().optional().describe("Customer email address."),
		metadata: z
			.record(z.string(), z.unknown())
			.nullable()
			.optional()
			.describe("Arbitrary metadata associated with the customer."),
		stripeId: z
			.string()
			.nullable()
			.optional()
			.describe("Existing Stripe customer ID."),
	})
	.describe("Customer data payload.");

/**
 * Inferred customer data payload from `CustomerDataSchema`.
 */
export type CustomerData = z.infer<typeof CustomerDataSchema>;
