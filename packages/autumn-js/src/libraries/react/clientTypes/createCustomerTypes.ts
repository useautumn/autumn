// Auto-generated Zod schema
import { z } from "zod";
import type { EntityData } from "./entityDataTypes";
import { EntityDataSchema } from "./entityDataTypes";

export const CustomerCreateParamsSchema = z.object({
	expand: z.string().describe("Query param:").optional(),
	email: z
		.string()
		.nullable()
		.describe("Body param: Customer's email address")
		.optional(),
	entityData: EntityDataSchema.nullable()
		.describe("Body param: Entity data for creating an entity")
		.optional(),
	entityId: z
		.string()
		.nullable()
		.describe("Body param: Entity ID to associate with the customer")
		.optional(),
	fingerprint: z
		.string()
		.nullable()
		.describe(
			"Body param: Unique identifier (eg, serial number) to detect duplicate customers\nand prevent free trial abuse",
		)
		.optional(),
	metadata: z
		.record(z.string(), z.unknown())
		.nullable()
		.describe("Body param: Additional metadata for the customer")
		.optional(),
	name: z
		.string()
		.nullable()
		.describe("Body param: Customer's name")
		.optional(),
	stripeId: z
		.string()
		.nullable()
		.describe("Body param: Stripe customer ID if you already have one")
		.optional(),
	errorOnNotFound: z
		.boolean()
		.optional()
		.describe("Whether to return an error if customer is not found"),
});

export interface CustomerCreateParams {
	/**
	 * Query param:
	 */
	expand?: string;

	/**
	 * Body param: Customer's email address
	 */
	email?: string | null;

	/**
	 * Body param: Entity data for creating an entity
	 */
	entityData?: EntityData | null;

	/**
	 * Body param: Entity ID to associate with the customer
	 */
	entityId?: string | null;

	/**
   * Body param: Unique identifier (eg, serial number) to detect duplicate customers
and prevent free trial abuse
   */
	fingerprint?: string | null;

	/**
	 * Body param: Additional metadata for the customer
	 */
	metadata?: { [key: string]: unknown } | null;

	/**
	 * Body param: Customer's name
	 */
	name?: string | null;

	/**
	 * Body param: Stripe customer ID if you already have one
	 */
	stripeId?: string | null;

	/**
	 * Whether to return an error if customer is not found
	 */
	errorOnNotFound?: boolean;
}
