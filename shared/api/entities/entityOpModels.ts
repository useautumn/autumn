import { z } from "zod/v4";
import { CusExpand } from "../../models/cusModels/cusExpand.js";
import { queryStringArray } from "../apiUtils.js";
import { CustomerDataSchema } from "../common/customerData.js";

// Create Entity Params (based on CreateEntitySchema from shared/models)
export const CreateEntityParamsSchema = z.object({
	id: z.string().nullable().meta({
		description: "The ID of the entity",
	}),
	name: z.string().nullish().meta({
		description: "The name of the entity",
	}),
	feature_id: z.string().meta({
		description: "The ID of the feature this entity is associated with",
	}),
	customer_data: CustomerDataSchema.optional(),
});

// Get Entity Query Params
export const GetEntityQuerySchema = z.object({
	expand: queryStringArray(
		z.enum([
			CusExpand.Invoices,
			CusExpand.SubscriptionsPlan,
			CusExpand.ScheduledSubscriptionsPlan,
			CusExpand.BalancesFeature,
		]),
	).default([]),
	skip_cache: z.boolean().optional(),
	with_autumn_id: z.boolean().optional(),
});

export const CreateEntityQuerySchema = z.object({
	with_autumn_id: z.boolean().default(false),
	from_auto_create: z.boolean().default(false),
});

export type CreateEntityParams = z.infer<typeof CreateEntityParamsSchema>;
export type GetEntityQuery = z.infer<typeof GetEntityQuerySchema>;
export type CreateEntityQuery = z.infer<typeof CreateEntityQuerySchema>;
