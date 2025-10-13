import { z } from "zod/v4";

// Base schema without top-level .meta() to avoid side effects during imports
export const EntityDataSchema = z.object({
	feature_id: z.string().meta({
		description: "The feature ID that this entity is associated with",
		example: "seats",
	}),
	name: z.string().optional().meta({
		description: "Name of the entity",
		example: "Team Alpha",
	}),
});

export type EntityData = z.infer<typeof EntityDataSchema>;
