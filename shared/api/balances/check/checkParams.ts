import { z } from "zod/v4";
import { CustomerDataSchema } from "../../common/customerData.js";
import { EntityDataSchema } from "../../common/entityData.js";
import { queryStringArray } from "../../common/queryHelpers.js";
import { CheckExpand } from "./enums/CheckExpand.js";

export const CheckQuerySchema = z.object({
	skip_cache: z.boolean().optional(),
	expand: queryStringArray(z.enum([CheckExpand.BalanceFeature])).optional(),
});

// Check Feature Schemas
export const ExtCheckParamsSchema = z.object({
	customer_id: z.string(),
	feature_id: z.string(),
	entity_id: z.string().optional(),

	customer_data: CustomerDataSchema.optional(),
	entity_data: EntityDataSchema.optional(),

	required_balance: z.number().optional(),
	properties: z.record(z.string(), z.any()).optional(),

	send_event: z.boolean().optional(),
	with_preview: z.boolean().optional(),
});

export const CheckParamsSchema = ExtCheckParamsSchema.extend({
	// Legacy 1: Used to allow check product_id and feature_id
	feature_id: z.string().optional(),
	product_id: z.string().optional(),

	// Legacy 2: required_balance used to be called required_quantity
	required_quantity: z.number().optional(),
}).refine(
	(data) => {
		if (data.product_id && data.feature_id) {
			return false;
		}

		if (!data.product_id && !data.feature_id) {
			return false;
		}

		return true;
	},
	{
		message: "Must provide either product_id or feature_id",
		path: [],
	},
);

export type CheckParams = z.infer<typeof CheckParamsSchema>;

export type CheckQuery = z.infer<typeof CheckQuerySchema>;
