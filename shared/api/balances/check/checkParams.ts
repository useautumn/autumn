import { z } from "zod/v4";
import { CustomerDataSchema } from "../../common/customerData.js";
import { EntityDataSchema } from "../../common/entityData.js";
import { queryStringArray } from "../../common/queryHelpers.js";
import { CheckExpand } from "./enums/CheckExpand.js";

const checkDescriptions = {
	customer_id: "ID which you provided when creating the customer",
	product_id:
		"ID of the product to check access to. Required if feature_id is not provided.",
	feature_id: "ID of the feature to check access to.",
	required_balance:
		"If you know the amount of the feature the end user is consuming in advance. If their balance is below this quantity, allowed will be false.",
	send_event:
		"If true, a usage event will be recorded together with checking access. The required_balance field will be used as the usage value.",
	with_preview:
		"If true, the response will include a preview object, which can be used to display information such as a paywall or upgrade confirmation.",
	entity_id:
		"If using entity balances (eg, seats), the entity ID to check access for.",
	customer_data:
		"Properties used if customer is automatically created. Will also update if the name or email is not already set.",
};

export const CheckQuerySchema = z.object({
	skip_cache: z.boolean().optional(),
	expand: queryStringArray(z.enum([CheckExpand.BalanceFeature])).optional(),
});

// Check Feature Schemas
export const ExtCheckParamsSchema = z.object({
	customer_id: z.string().meta({
		description: checkDescriptions.customer_id,
	}),

	feature_id: z.string().meta({
		description: checkDescriptions.feature_id,
	}),
	entity_id: z.string().optional().meta({
		description: checkDescriptions.entity_id,
	}),

	required_balance: z.number().optional().meta({
		description: checkDescriptions.required_balance,
	}),

	properties: z.record(z.string(), z.any()).optional(),

	send_event: z.boolean().optional().meta({
		description: checkDescriptions.send_event,
	}),

	with_preview: z.boolean().optional().meta({
		description: checkDescriptions.with_preview,
	}),

	customer_data: CustomerDataSchema.optional().meta({
		internal: true,
	}),

	entity_data: EntityDataSchema.optional().meta({
		internal: true,
	}),
});

export const CheckParamsSchema = ExtCheckParamsSchema.extend({
	// Legacy 1: Used to allow check product_id and feature_id
	feature_id: z.string().optional(),
	product_id: z.string().optional(),

	// Legacy 2: required_balance used to be called required_quantity
	required_quantity: z.number().optional(),

	skip_event: z.boolean().optional().meta({
		internal: true,
	}),
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
