import { z } from "zod/v4";

// Create Entity Params (based on CreateEntitySchema from shared/models)
export const CreateEntityParamsSchema = z.object({
	id: z.string().meta({
		description: "The ID of the entity",
		example: "entity_123",
	}),
	name: z.string().nullish().meta({
		description: "The name of the entity",
		example: "Team Alpha",
	}),
	feature_id: z.string().meta({
		description: "The ID of the feature this entity is associated with",
		example: "seats",
	}),
});

// Get Entity Query Params
export const GetEntityQuerySchema = z.object({
	expand: z.string().optional().meta({
		description: "Comma-separated list of fields to expand (e.g., 'invoices')",
		example: "invoices",
	}),
});

export type CreateEntityParams = z.infer<typeof CreateEntityParamsSchema>;
export type GetEntityQuery = z.infer<typeof GetEntityQuerySchema>;
