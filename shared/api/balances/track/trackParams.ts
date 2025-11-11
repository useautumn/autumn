import { z } from "zod/v4";
import { CusExpand } from "../../../models/cusModels/cusExpand.js";
import { CustomerDataSchema } from "../../common/customerData.js";
import { EntityDataSchema } from "../../common/entityData.js";

const trackDescriptions = {
	customer_id: "The ID of the customer",
	customer_data:
		"Customer data to create or update the customer if they don't exist",
	event_name: "The name of the event to track",
	feature_id:
		"The ID of the feature (alternative to event_name for usage events)",
	properties: "Additional properties for the event",
	timestamp: "Unix timestamp in milliseconds when the event occurred",
	idempotency_key: "Idempotency key to prevent duplicate events",
	value: "The value/count of the event",
	set_usage: "Whether to set the usage to this value instead of increment",
	entity_id: "The ID of the entity this event is associated with",
	entity_data: "Data for creating the entity if it doesn't exist",
	skip_event:
		"Skip event insertion (for stress tests). Balance is still deducted, but event is not persisted to database.",
};

export const TrackQuerySchema = z.object({
	expand: z.array(z.enum([CusExpand.BalanceFeature])).optional(),
	skip_cache: z.boolean().optional(),
});

// Track Schemas
export const TrackParamsSchema = z
	.object({
		customer_id: z.string().nonempty().meta({
			description: trackDescriptions.customer_id,
		}),
		customer_data: CustomerDataSchema.optional().meta({
			description: trackDescriptions.customer_data,
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
			description: "Additional properties for the event",
		}),
		timestamp: z.number().optional().meta({
			description: "Unix timestamp in milliseconds when the event occurred",
		}),
		idempotency_key: z.string().optional().meta({
			description: "Idempotency key to prevent duplicate events",
		}),

		set_usage: z.boolean().nullish().meta({
			description:
				"Whether to set the usage to this value instead of increment",
		}),
		entity_id: z.string().optional().meta({
			description: "The ID of the entity this event is associated with",
		}),
		entity_data: EntityDataSchema.optional().meta({
			description: "Data for creating the entity if it doesn't exist",
		}),
		overage_behavior: z.enum(["cap", "reject"]).optional().meta({
			description: "The behavior when the balance is insufficient",
		}),
		skip_event: z.boolean().optional().meta({
			description: trackDescriptions.skip_event,
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
