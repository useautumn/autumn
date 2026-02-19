import { z } from "zod/v4";
import { queryStringArray } from "../apiUtils.js";
import { CustomerExpand } from "../customers/components/customerExpand/customerExpand.js";

// Create Entity Params (based on CreateEntitySchema from shared/models)

// Get Entity Query Params
export const GetEntityQuerySchema = z.object({
	expand: queryStringArray(
		z.enum([
			CustomerExpand.Invoices,
			CustomerExpand.SubscriptionsPlan,
			CustomerExpand.PurchasesPlan,
			CustomerExpand.BalancesFeature,
		]),
	).default([]),
	skip_cache: z.boolean().optional(),
	with_autumn_id: z.boolean().optional(),
});

export const CreateEntityQuerySchema = z.object({
	with_autumn_id: z.boolean().default(false),
	from_auto_create: z.boolean().default(false),
});

export type GetEntityQuery = z.infer<typeof GetEntityQuerySchema>;
export type CreateEntityQuery = z.infer<typeof CreateEntityQuerySchema>;
