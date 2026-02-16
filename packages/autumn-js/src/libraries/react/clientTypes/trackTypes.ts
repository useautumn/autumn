// Auto-generated Zod schema
import { z } from "zod";
import type { CustomerData } from "./customerDataTypes";
import { CustomerDataSchema } from "./customerDataTypes";
import type { EntityData } from "./entityDataTypes";
import { EntityDataSchema } from "./entityDataTypes";

export const TrackParamsSchema = z.object({
	customerData: CustomerDataSchema.nullable()
		.describe("Customer data for creating or updating a customer")
		.optional(),
	entityData: EntityDataSchema.nullable()
		.describe("Entity data for creating an entity")
		.optional(),
	entityId: z
		.string()
		.nullable()
		.describe("The ID of the entity this event is associated with")
		.optional(),
	eventName: z.string().describe("The name of the event to track").optional(),
	featureId: z
		.string()
		.describe(
			"The ID of the feature (alternative to event_name for usage events)",
		)
		.optional(),
	idempotencyKey: z
		.string()
		.nullable()
		.describe("Idempotency key to prevent duplicate events")
		.optional(),
	properties: z
		.record(z.string(), z.unknown())
		.nullable()
		.describe("Additional properties for the event")
		.optional(),
	setUsage: z
		.boolean()
		.nullable()
		.describe("Whether to set the usage to this value instead of increment")
		.optional(),
	timestamp: z
		.number()
		.nullable()
		.describe("Unix timestamp in milliseconds when the event occurred")
		.optional(),
	value: z
		.number()
		.nullable()
		.describe("The value/count of the event")
		.optional(),
});

export interface TrackParams {
	/**
	 * Customer data for creating or updating a customer
	 */
	customerData?: CustomerData | null;

	/**
	 * Entity data for creating an entity
	 */
	entityData?: EntityData | null;

	/**
	 * The ID of the entity this event is associated with
	 */
	entityId?: string | null;

	/**
	 * The name of the event to track
	 */
	eventName?: string;

	/**
	 * The ID of the feature (alternative to event_name for usage events)
	 */
	featureId?: string;

	/**
	 * Idempotency key to prevent duplicate events
	 */
	idempotencyKey?: string | null;

	/**
	 * Additional properties for the event
	 */
	properties?: { [key: string]: unknown } | null;

	/**
	 * Whether to set the usage to this value instead of increment
	 */
	setUsage?: boolean | null;

	/**
	 * Unix timestamp in milliseconds when the event occurred
	 */
	timestamp?: number | null;

	/**
	 * The value/count of the event
	 */
	value?: number | null;
}
