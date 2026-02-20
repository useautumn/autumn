import { z } from "zod/v4";

export const GetEntityParamsV0Schema = z.object({
	customer_id: z.string().optional().meta({
		description: "The ID of the customer to create the entity for.",
	}),
	entity_id: z.string().meta({
		description: "The ID of the entity.",
	}),
});

export type GetEntityParamsV0 = z.infer<typeof GetEntityParamsV0Schema>;
