import { z } from "zod/v4";
import { BalanceParamsBaseSchema } from "../common/balanceParamsBase";
import { CustomerDataSchema } from "../../common/customerData";
import { EntityDataSchema } from "../../common/entityData";
import { queryStringArray } from "../../common/queryHelpers";
import { CheckExpand } from "./enums/CheckExpand";

export const CheckQuerySchema = z.object({
	skip_cache: z.boolean().optional(),
	expand: queryStringArray(z.enum([CheckExpand.BalanceFeature])).optional(),
});

// Check Feature Schemas
export const ExtCheckParamsSchema = BalanceParamsBaseSchema.extend({
	required_balance: z.number().optional().meta({
		description:
			"Minimum balance required for access. Returns allowed: false if the customer's balance is below this value. Defaults to 1.",
	}),

	properties: z.record(z.string(), z.any()).optional().meta({
		description:
			"Additional properties to attach to the usage event if send_event is true.",
	}),

	send_event: z.boolean().optional().meta({
		description:
			"If true, atomically records a usage event while checking access. The required_balance value is used as the usage amount. Combines check + track in one call.",
	}),

	with_preview: z.boolean().optional().meta({
		description:
			"If true, includes upgrade/upsell information in the response when access is denied. Useful for displaying paywalls.",
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
