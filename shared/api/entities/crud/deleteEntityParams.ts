import { z } from "zod/v4";

export const DeleteEntityParamsV0Schema = z.object({
	customer_id: z.string().optional().meta({
		description: "The ID of the customer.",
	}),
	entity_id: z.string().meta({
		description: "The ID of the entity.",
	}),
});

export type DeleteEntityParamsV0 = z.infer<typeof DeleteEntityParamsV0Schema>;
