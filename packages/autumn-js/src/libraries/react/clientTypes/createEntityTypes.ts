// Auto-generated Zod schema
import { z } from "zod";

export const EntityCreateParamsSchema = z.object({
	id: z.string().describe("The ID of the entity"),
	featureId: z
		.string()
		.describe("The ID of the feature this entity is associated with"),
	name: z.string().nullable().describe("The name of the entity").optional(),
});

export interface EntityCreateParams {
	/**
	 * The ID of the entity
	 */
	id: string;

	/**
	 * The ID of the feature this entity is associated with
	 */
	featureId: string;

	/**
	 * The name of the entity
	 */
	name?: string | null;
}
