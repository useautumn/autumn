import { z } from "zod/v4";
import { CustomerDataSchema } from "../../../common/customerData.js";
import { EntityDataSchema } from "../../../common/entityData.js";

/**
 * TrackParamsV0Schema - V1.2 and earlier format
 *
 * In V1.2, the `value` field could be passed either as a top-level field OR
 * inside `properties.value`. This schema supports both, with the transformation
 * extracting `properties.value` only if top-level `value` is not provided.
 */
export const TrackParamsV0Schema = z
	.object({
		customer_id: z.string().nonempty(),
		feature_id: z.string().optional(),
		event_name: z.string().nonempty().optional(),
		value: z.number().optional(),
		properties: z.record(z.string(), z.any()).optional(),
		timestamp: z.number().optional(),
		idempotency_key: z.string().optional(),
		customer_data: CustomerDataSchema.optional(),
		entity_id: z.string().optional(),
		entity_data: EntityDataSchema.optional(),
		overage_behavior: z.enum(["cap", "reject"]).optional(),
		skip_event: z.boolean().optional(),
	})
	.refine(
		(data) => {
			if (data.feature_id && data.event_name) return false;
			if (!data.feature_id && !data.event_name) return false;
			return true;
		},
		{
			message: "Either feature_id or event_name must be provided",
		},
	);

export type TrackParamsV0 = z.infer<typeof TrackParamsV0Schema>;
