// Auto-generated Zod schema
import { z } from "zod";
import type { CustomerData } from "./customerDataTypes";
import { CustomerDataSchema } from "./customerDataTypes";
import type { EntityData } from "./entityDataTypes";
import { EntityDataSchema } from "./entityDataTypes";

export const CheckParamsSchema = z.object({
	customerData: CustomerDataSchema.describe(
		"Customer data to create or update the customer if they don't exist",
	).optional(),
	entityData: EntityDataSchema.describe(
		"Entity data to create the entity if it doesn't exist",
	).optional(),
	entityId: z.string().describe("The ID of the entity (optional)").optional(),
	featureId: z
		.string()
		.describe("The ID of the feature to check access for")
		.optional(),
	productId: z.string().describe("The ID of the product to check").optional(),
	requiredBalance: z
		.number()
		.describe("The required balance for the check")
		.optional(),
	sendEvent: z
		.boolean()
		.describe("Whether to send a usage event if allowed")
		.optional(),
	withPreview: z
		.boolean()
		.describe("Whether to include preview information in the response")
		.optional(),
	dialog: z
		.any()
		.optional()
		.describe("Dialog configuration for feature check flow"),
	properties: z
		.record(z.string(), z.any())
		.optional()
		.describe("Additional properties for the feature check"),
});

export interface CheckParams {
	/**
	 * Customer data to create or update the customer if they don't exist
	 */
	customerData?: CustomerData;

	/**
	 * Entity data to create the entity if it doesn't exist
	 */
	entityData?: EntityData;

	/**
	 * The ID of the entity (optional)
	 */
	entityId?: string;

	/**
	 * The ID of the feature to check access for
	 */
	featureId?: string;

	/**
	 * The ID of the product to check
	 */
	productId?: string;

	/**
	 * The required balance for the check
	 */
	requiredBalance?: number;

	/**
	 * Whether to send a usage event if allowed
	 */
	sendEvent?: boolean;

	/**
	 * Whether to include preview information in the response
	 */
	withPreview?: boolean;

	/**
	 * Dialog configuration for feature check flow
	 */
	dialog?: any;

	/**
	 * Additional properties for the feature check
	 */
	properties?: Record<string, any>;
}
