import { SuccessResponseSchema } from "@api/common/commonResponses.js";
import {
	CreateProductV2ParamsSchema,
	UpdateProductV2ParamsSchema,
} from "@api/models.js";
import { z } from "zod/v4";
import { ApiProductSchema } from "./apiProduct.js";

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
			feature: null,
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
			feature_type: "single_use",
			// feature: {
			// 	id: "words",
			// 	name: "Words",
			// 	type: "single_use",
			// 	display: {
			// 		singular: "Words",
			// 		plural: "Words",
			// 	},
			// 	archived: false,
			// },
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
			feature_type: "static",
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
			feature_type: "single_use",
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
	free_trial: null,
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

// Register schema with .meta() for OpenAPI spec generation
export const ApiProductWithMeta = ApiProductSchema.meta({
	id: "Product",
	description: "A product",
	examples: [PRODUCT_EXAMPLE],
});

export const productOps = {
	"/products": {
		get: {
			summary: "List Products",
			tags: ["products"],
			requestParams: {
				query: z.object({
					customer_id: z.string().optional(),
				}),
			},
			responses: {
				"200": {
					description: "200 OK",
					content: {
						"application/json": {
							schema: z.object({
								list: z.array(ApiProductWithMeta),
							}),
						},
					},
				},
			},
		},
		post: {
			summary: "Create Product",
			tags: ["products"],
			requestBody: {
				content: {
					"application/json": { schema: CreateProductV2ParamsSchema },
				},
			},
			responses: {
				"200": {
					description: "200 OK",
					content: { "application/json": { schema: ApiProductWithMeta } },
				},
			},
		},
	},
	"/products/{product_id}": {
		get: {
			summary: "Get Product",
			tags: ["products"],
			requestParams: {
				path: z.object({
					product_id: z.string(),
				}),
			},
			responses: {
				"200": {
					description: "Product retrieved successfully",
					content: { "application/json": { schema: ApiProductWithMeta } },
				},
			},
		},
		patch: {
			summary: "Update Product",
			tags: ["products"],
			requestParams: {
				path: z.object({
					product_id: z.string(),
				}),
			},
			requestBody: {
				content: {
					"application/json": { schema: UpdateProductV2ParamsSchema },
				},
			},
			responses: {
				"200": {
					description: "200 OK",
					content: { "application/json": { schema: ApiProductWithMeta } },
				},
			},
		},
		delete: {
			summary: "Delete Product",
			tags: ["products"],
			requestParams: {
				path: z.object({
					product_id: z.string(),
				}),
				query: z.object({
					all_versions: z.boolean().optional(),
				}),
			},
			responses: {
				"200": {
					description: "Product deleted successfully",
					content: {
						"application/json": {
							schema: SuccessResponseSchema,
						},
					},
				},
			},
		},
	},
};
