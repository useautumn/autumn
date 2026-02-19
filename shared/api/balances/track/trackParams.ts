import { z } from "zod/v4";
import { CustomerDataSchema } from "../../common/customerData";
import { EntityDataSchema } from "../../common/entityData";
import { queryStringArray } from "../../common/queryHelpers";
import { CheckExpand } from "../check/enums/CheckExpand";
import { BalanceParamsBaseSchema } from "../common/balanceParamsBase";

export const TrackQuerySchema = z.object({
	expand: queryStringArray(z.enum([CheckExpand.BalanceFeature])).optional(),
	skip_cache: z.boolean().optional(),
});

// Track Schemas
export const TrackParamsSchema = BalanceParamsBaseSchema.extend({
	feature_id: z.string().optional().meta({
		description:
			"The ID of the feature to track usage for. Required if event_name is not provided.",
	}),
	event_name: z.string().nonempty().optional().meta({
		description:
			"Event name to track usage for. Use instead of feature_id when multiple features should be tracked from a single event.",
	}),
	value: z.number().optional().meta({
		description:
			"The amount of usage to record. Defaults to 1. Use negative values to credit balance (e.g., when removing a seat).",
	}),
	properties: z.record(z.string(), z.any()).optional().meta({
		description: "Additional properties to attach to this usage event.",
	}),

	idempotency_key: z.string().optional().meta({
		internal: true,
	}),

	timestamp: z.number().optional().meta({
		internal: true,
	}),

	overage_behavior: z.enum(["cap", "reject"]).optional().meta({
		internal: true,
	}),

	customer_data: CustomerDataSchema.optional().meta({
		internal: true,
	}),
	entity_data: EntityDataSchema.optional().meta({
		internal: true,
	}),

	skip_event: z.boolean().optional().meta({
		internal: true,
	}),
}).refine(
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
