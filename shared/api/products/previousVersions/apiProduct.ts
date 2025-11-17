import { AttachScenario } from "@models/checkModels/checkPreviewModels.js";
import { AppEnv } from "@models/genModels/genEnums.js";
import { z } from "zod/v4";
import { ApiFreeTrialSchema } from "../apiFreeTrial.js";
import { ApiProductItemSchema } from "../planFeature/previousVersions/apiProductItem.js";

export const PRODUCT_EXAMPLE = {
	id: "Pro Product",
	name: "Pro Plan",
	group: null,
	env: "sandbox",
	is_add_on: false,
	is_default: false,
	archived: false,
	version: 1,
	created_at: 1761296829908,
	items: [
		{
			type: "price",
			feature_id: null,
			interval: "month",
			interval_count: 1,
			price: 20,
			display: {
				primary_text: "$20",
				secondary_text: "per month",
			},
		},
		{
			type: "priced_feature",
			feature_id: "words",
			included_usage: 1000,
			interval: "month",
			interval_count: 1,
			price: 0.5,
			usage_model: "pay_per_use",
			billing_units: 1000,
			reset_usage_when_enabled: true,
			entity_feature_id: null,
			display: {
				primary_text: "1,000 Words",
				secondary_text: "then $0.5 per 1,000 Words",
			},
		},
		{
			type: "feature",
			feature_id: "dashboard",
			// feature_type: "static",
			// feature: {
			// 	id: "dashboard",
			// 	name: "Dashboard",
			// 	type: "boolean",
			// 	display: {
			// 		singular: "Dashboard",
			// 		plural: "Dashboard",
			// 	},
			// 	archived: false,
			// },
			entity_feature_id: null,
			display: {
				primary_text: "Dashboard",
			},
		},
		{
			type: "feature",
			feature_id: "messages",
			// feature_type: "single_use",
			// feature: {
			// 	id: "messages",
			// 	name: "Messages",
			// 	type: "single_use",
			// 	display: {
			// 		singular: "Messages",
			// 		plural: "Messages",
			// 	},
			// 	archived: false,
			// },
			included_usage: 10,
			interval: "month",
			interval_count: 1,
			reset_usage_when_enabled: true,
			entity_feature_id: null,
			display: {
				primary_text: "10 Messages",
			},
		},
	],
	free_trial: {
		duration: "day",
		length: 7,
		unique_fingerprint: false,
		card_required: true,
	},

	base_variant_id: null,
	scenario: "new",
	// properties: {
	// 	is_free: false,
	// 	is_one_off: false,
	// 	interval_group: "month",
	// 	has_trial: false,
	// 	updateable: false,
	// },
};

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
	id: z
		.string()
		.describe("The ID of the product you set when creating the product"),

	name: z.string().describe("The name of the product"),

	group: z
		.string()
		.nullable()
		.describe("Product group which this product belongs to"),

	env: z.enum(AppEnv).describe("The environment of the product"),

	is_add_on: z
		.boolean()
		.describe(
			"Whether the product is an add-on and can be purchased alongside other products",
		),

	is_default: z
		.boolean()
		.describe("Whether the product is the default product"),

	archived: z
		.boolean({ message: "archived should be a boolean" })
		.describe(
			"Whether this product has been archived and is no longer available",
		),

	version: z.number().describe("The current version of the product"),

	created_at: z
		.number()
		.describe(
			"The timestamp of when the product was created in milliseconds since epoch",
		),

	items: z
		.array(ApiProductItemSchema)
		.describe(
			"Array of product items that define the product's features and pricing",
		),

	free_trial: ApiFreeTrialSchema.nullable().describe(
		"Free trial configuration for this product, if available",
	),

	base_variant_id: z
		.string()
		.nullable()
		.describe("ID of the base variant this product is derived from"),

	scenario: z
		.enum(AttachScenario)
		.optional()
		.describe("Scenario for when this product is used in attach flows"),

	properties: ApiProductPropertiesSchema.optional(),
});

export type ApiProduct = z.infer<typeof ApiProductSchema>;
export type ApiProductProperties = z.infer<typeof ApiProductPropertiesSchema>;
