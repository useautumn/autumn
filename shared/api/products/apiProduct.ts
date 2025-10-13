import { AttachScenario } from "@models/checkModels/checkPreviewModels.js";
import { AppEnv } from "@models/genModels/genEnums.js";
import { z } from "zod/v4";
import { APIFreeTrialSchema } from "./apiFreeTrial.js";
import { ApiProductItemSchema } from "./apiProductItem.js";

export const ApiProductPropertiesSchema = z.object({
	is_free: z.boolean().meta({
		description: "True if the product has no base price or usage prices",
		example: false,
	}),
	is_one_off: z.boolean().meta({
		description: "True if the product only contains a one-time price",
		example: false,
	}),
	interval_group: z.string().nullish().meta({
		description:
			"The billing interval group for recurring products (e.g., 'monthly', 'yearly')",
		example: "monthly",
	}),
	has_trial: z.boolean().nullish().meta({
		description: "True if the product includes a free trial",
		example: true,
	}),
	updateable: z.boolean().nullish().meta({
		description:
			"True if the product can be updated after creation (only applicable if there are prepaid recurring prices)",
		example: true,
	}),
});

export const ApiProductSchema = z.object({
	id: z.string().meta({
		description: "The ID of the product you set when creating the product",
		example: "pro_plan",
	}),

	name: z.string().meta({
		description: "The name of the product",
		example: "Pro Plan",
	}),

	group: z.string().nullable().meta({
		description: "The group of the product",
		example: "product_set_1",
	}),

	env: z.enum(AppEnv).meta({
		description: "The environment of the product",
		example: "production",
	}),

	is_add_on: z.boolean().meta({
		description:
			"Whether the product is an add-on and can be purchased alongside other products",
		example: true,
	}),

	is_default: z.boolean().meta({
		description: "Whether the product is the default product",
		example: true,
	}),

	archived: z.boolean({ message: "archived should be a boolean" }).meta({
		description:
			"Whether this product has been archived and is no longer available",
		example: false,
	}),

	version: z.number().meta({
		description: "The version of the product",
		example: 1,
	}),

	created_at: z.number().meta({
		description:
			"The timestamp of when the product was created in milliseconds since epoch",
		example: 1759247877000,
	}),

	items: z.array(ApiProductItemSchema).meta({
		description: "Array of product items that define the features and pricing",
		example: [
			{
				feature_id: "<string>",
				feature_type: "single_use",
				included_usage: 123,
				interval: "<string>",
				usage_model: "prepaid",
				price: 123,
				billing_units: 123,
				entity_feature_id: "<string>",
				reset_usage_when_enabled: true,
				tiers: [
					{
						to: 123,
						amount: 123,
					},
				],
			},
		],
	}),

	free_trial: APIFreeTrialSchema.nullable().meta({
		description: "Free trial configuration for this product, if available",
		example: {
			duration: "<string>",
			length: 123,
			unique_fingerprint: true,
		},
	}),

	base_variant_id: z.string().nullable().meta({
		description: "ID of the base variant this product is derived from",
		example: "var_1234567890abcdef",
	}),

	scenario: z.enum(AttachScenario).optional().meta({
		description:
			"Scenario context for when this product is used in attach flows",
		example: "upgrade",
	}),

	properties: ApiProductPropertiesSchema.optional().meta({
		description: "Additional properties and metadata for the product",
		example: {
			is_free: false,
			is_one_off: false,
			interval_group: "monthly",
			has_trial: true,
			updateable: true,
		},
	}),
});

export type ApiProduct = z.infer<typeof ApiProductSchema>;
export type ApiProductProperties = z.infer<typeof ApiProductPropertiesSchema>;
