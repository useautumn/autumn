import { z } from "zod/v4";

export const EntityDataSchema = z
	.object({
		feature_id: z.string().meta({
			description: "The feature ID that this entity is associated with",
		}),
		name: z.string().optional().meta({
			description: "Name of the entity",
		}),
	})
	.meta({
		title: "EntityData",
		description: "Data for creating or identifying an entity.",
	});

export type EntityData = z.infer<typeof EntityDataSchema>;
