// Alias for backward compatibility
import { z } from "zod/v4";
import { AppEnv } from "../../models/genModels/genEnums.js";

const entityDescriptions = {
	id: "The unique identifier of the entity",
	name: "The name of the entity",
	customer_id: "The customer ID this entity belongs to",
	feature_id: "The feature ID this entity belongs to",
	created_at: "Unix timestamp when the entity was created",
	env: "The environment (sandbox/live)",
};

export const ApiBaseEntitySchema = z.object({
	autumn_id: z.string().optional(),

	id: z.string().nullable().meta({
		description: entityDescriptions.id,
	}),
	name: z.string().nullable().meta({
		description: entityDescriptions.name,
	}),
	customer_id: z.string().nullish().meta({
		description: entityDescriptions.customer_id,
	}),
	feature_id: z.string().nullish().meta({
		description: entityDescriptions.feature_id,
	}),
	created_at: z.number().meta({
		description: entityDescriptions.created_at,
	}),
	env: z.enum(AppEnv).meta({
		description: entityDescriptions.env,
	}),
});

export type ApiBaseEntity = z.infer<typeof ApiBaseEntitySchema>;
