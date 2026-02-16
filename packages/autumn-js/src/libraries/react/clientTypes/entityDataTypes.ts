// Auto-generated Zod schema
import { z } from "zod";

export const EntityDataSchema = z
	.object({
		featureId: z
			.string()
			.describe("The feature ID that this entity is associated with"),
		name: z.string().describe("Name of the entity").optional(),
	})
	.describe("Entity data for creating an entity");

/**
 * Entity data for creating an entity
 */
export interface EntityData {
	/**
	 * The feature ID that this entity is associated with
	 */
	featureId: string;

	/**
	 * Name of the entity
	 */
	name?: string;
}
