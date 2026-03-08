import { z } from "zod/v4";
import { CustomerDataSchema } from "../../common/customerData";
import { EntityDataSchema } from "../../common/entityData";

export const TrackTokensParamsSchema = z.object({
	customer_id: z.string().meta({
		description: "The ID of the customer.",
	}),
	entity_id: z.string().optional().meta({
		description: "The ID of the entity for entity-scoped balances.",
	}),
	feature_id: z.string().optional().meta({
		description:
			"The ID of the AI credit system feature. Auto-detected if omitted.",
	}),
	model: z.string().meta({
		description: "The AI model name (e.g., 'claude-opus-4-6').",
	}),
	input_tokens: z.number().int().nonnegative().meta({
		description: "Number of input tokens consumed.",
	}),
	output_tokens: z.number().int().nonnegative().meta({
		description: "Number of output tokens consumed.",
	}),
	properties: z.record(z.string(), z.any()).optional().meta({
		description: "Additional properties to attach to this usage event.",
	}),
	idempotency_key: z.string().optional().meta({
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
});

export type TrackTokensParams = z.infer<typeof TrackTokensParamsSchema>;
