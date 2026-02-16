// Auto-generated Zod schema
import { z } from "zod";

export const CustomerDataSchema = z
	.object({
		email: z
			.string()
			.nullable()
			.describe("Customer's email address")
			.optional(),
		fingerprint: z
			.string()
			.nullable()
			.describe(
				"Unique identifier (eg, serial number) to detect duplicate customers and prevent\nfree trial abuse",
			)
			.optional(),
		metadata: z
			.record(z.string(), z.unknown())
			.nullable()
			.describe("Additional metadata for the customer")
			.optional(),
		name: z.string().nullable().describe("Customer's name").optional(),
		stripeId: z
			.string()
			.nullable()
			.describe("Stripe customer ID if you already have one")
			.optional(),
	})
	.describe("Customer data for creating or updating a customer");

/**
 * Customer data for creating or updating a customer
 */
export interface CustomerData {
	/**
	 * Customer's email address
	 */
	email?: string | null;

	/**
   * Unique identifier (eg, serial number) to detect duplicate customers and prevent
free trial abuse
   */
	fingerprint?: string | null;

	/**
	 * Additional metadata for the customer
	 */
	metadata?: { [key: string]: unknown } | null;

	/**
	 * Customer's name
	 */
	name?: string | null;

	/**
	 * Stripe customer ID if you already have one
	 */
	stripeId?: string | null;
}
