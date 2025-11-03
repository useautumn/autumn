import { z } from "zod/v4";
import { CustomerDataSchema } from "../common/customerData.js";
export const SetUsageParamsSchema = z.object({
	customer_id: z.string().nonempty().meta({
		description: "The ID of the customer.",
	}),

	feature_id: z.string().meta({
		description: "The ID of the feature to set usage for.",
	}),

	value: z.number().meta({
		description:
			"The value you want to set this customer's usage of the feature to.",
	}),

	entity_id: z.string().optional().meta({
		description: "The ID of the entity to set usage for.",
	}),

	customer_data: CustomerDataSchema.optional(),
});

export type SetUsageParams = z.infer<typeof SetUsageParamsSchema>;
