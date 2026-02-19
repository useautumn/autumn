import { z } from "zod/v4";
import { CustomerDataSchema } from "../../common/customerData.js";

export const CreateEntityParamsV0Schema = z.object({
	id: z
		.preprocess(
			(val) => (typeof val === "number" ? String(val) : val),
			z.string(),
		)
		.nullable()
		.meta({
			description: "The ID of the entity",
		}),
	name: z.string().nullish().meta({
		description: "The name of the entity",
	}),
	feature_id: z.string().meta({
		description: "The ID of the feature this entity is associated with",
	}),
	customer_data: CustomerDataSchema.optional().meta({
		description:
			"Customer attributes used to resolve the customer when customer_id is not provided.",
	}),
});

export const CreateEntityParamsV1Schema = CreateEntityParamsV0Schema.omit({
	id: true,
}).extend({
	customer_id: z.string().meta({
		description: "The ID of the customer to create the entity for.",
	}),
	entity_id: z.string().meta({
		description: "The ID of the entity.",
	}),
});

export type CreateEntityParams = z.infer<typeof CreateEntityParamsV0Schema>;
