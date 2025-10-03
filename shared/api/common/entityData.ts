import { z } from "zod/v4";

export const EntityDataSchema = z
	.object({
		feature_id: z.string().meta({
			description: "The feature ID that this entity is associated with",
			example: "seats",
		}),
		name: z.string().optional().meta({
			description: "Name of the entity",
			example: "Team Alpha",
		}),
	})
	.meta({
		id: "EntityData",
		description: "Entity data for creating an entity",
	});

export type EntityData = z.infer<typeof EntityDataSchema>;
