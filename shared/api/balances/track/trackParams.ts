import { z } from "zod/v4";
import { CustomerDataSchema } from "../../common/customerData.js";
import { EntityDataSchema } from "../../common/entityData.js";
import { queryStringArray } from "../../common/queryHelpers.js";
import { CheckExpand } from "../check/enums/CheckExpand.js";

const trackDescriptions = {
	customer_id: "ID which you provided when creating the customer",
	feature_id:
		"ID of the feature to track usage for. Required if event_name is not provided. Use this for direct feature tracking.",
	event_name:
		"An [event name](/features/tracking-usage#using-event-names) can be used in place of feature_id. This can be used if multiple features are tracked in the same event.",
	value:
		"The amount of usage to record. Defaults to 1. Can be negative to increase the balance (e.g., when removing a seat).",
	customer_data:
		"Additional customer properties. These will be used to create or update the customer if they don't exist or their properties are not already set.",
	properties: "Additional properties to attach to this usage event.",
	timestamp:
		"Unix timestamp in milliseconds when the event occurred. Defaults to current time if not provided.",
	idempotency_key:
		"Unique key to prevent duplicate event recording. Use this to safely retry requests without creating duplicate usage records.",
	entity_id:
		"If using [entity balances](/features/feature-entities) (eg, seats), the entity ID to track usage for.",
	entity_data:
		"Additional entity properties. These will be used to create the entity if it doesn't exist.",
	overage_behavior:
		"How to handle usage when balance is insufficient. 'cap' limits usage to available balance, 'reject' prevents the usage entirely.",
	skip_event:
		"If true, balance is deducted but the event is not persisted to the database. Used for performance testing only.",
};

export const TrackQuerySchema = z.object({
	expand: queryStringArray(z.enum([CheckExpand.BalanceFeature])).optional(),
	skip_cache: z.boolean().optional(),
});

// Track Schemas
export const TrackParamsSchema = z
	.object({
		customer_id: z.string().nonempty().meta({
			description: trackDescriptions.customer_id,
		}),
		feature_id: z.string().optional().meta({
			description: trackDescriptions.feature_id,
		}),
		event_name: z.string().nonempty().optional().meta({
			description: trackDescriptions.event_name,
		}),
		value: z.number().optional().meta({
			description: trackDescriptions.value,
		}),
		properties: z.record(z.string(), z.any()).optional().meta({
			description: trackDescriptions.properties,
		}),
		timestamp: z.number().optional().meta({
			internal: true,
		}),
		idempotency_key: z.string().optional().meta({
			description: trackDescriptions.idempotency_key,
		}),
		customer_data: CustomerDataSchema.optional().meta({
			description: trackDescriptions.customer_data,
		}),

		// set_usage: z.boolean().nullish().meta({
		// 	description:
		// 		"Whether to set the usage to this value instead of increment",
		// }),

		entity_id: z.string().optional().meta({
			description: trackDescriptions.entity_id,
		}),
		entity_data: EntityDataSchema.optional().meta({
			internal: true,
		}),
		overage_behavior: z.enum(["cap", "reject"]).optional().meta({
			description: trackDescriptions.overage_behavior,
		}),
		skip_event: z.boolean().optional().meta({
			internal: true,
		}),
	})
	.refine(
		(data) => {
			if (data.feature_id && data.event_name) {
				return false;
			}

			if (!data.feature_id && !data.event_name) {
				return false;
			}

			return true;
		},
		{
			message: "Either feature_id or event_name must be provided",
		},
	);

export type TrackParams = z.infer<typeof TrackParamsSchema>;
export type TrackQuery = z.infer<typeof TrackQuerySchema>;
