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
			"The ID of the AI credit system feature. Auto-detected from the customer's entitlements if omitted: usage drains the included (capped) systems first, then spills the remainder into the overage system at its own markup. Pass a feature_id to target a single system directly. Required only when more than one system allows overage, since the overflow target is then ambiguous.",
	}),
	model_id: z.string().meta({
		description:
			"The AI model as '<provider>/<model>' (e.g. 'anthropic/claude-opus-4-8', 'openrouter/openai/gpt-4o'). The provider is the first path segment and must match a provider + model key in models.dev.",
	}),
	input_tokens: z.number().int().nonnegative().meta({
		description:
			"Number of non-cached text input tokens consumed. Exclusive of cache and audio token pools.",
	}),
	output_tokens: z.number().int().nonnegative().meta({
		description:
			"Number of text output tokens consumed. Exclusive of the reasoning and audio output pools.",
	}),
	cache_read_tokens: z.number().int().nonnegative().optional().meta({
		description: "Number of cached input tokens read.",
	}),
	cache_write_tokens: z.number().int().nonnegative().optional().meta({
		description: "Number of input tokens written to the cache.",
	}),
	audio_input_tokens: z.number().int().nonnegative().optional().meta({
		description: "Number of audio input tokens consumed.",
	}),
	audio_output_tokens: z.number().int().nonnegative().optional().meta({
		description: "Number of audio output tokens generated.",
	}),
	reasoning_tokens: z.number().int().nonnegative().optional().meta({
		description: "Number of reasoning tokens generated.",
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
