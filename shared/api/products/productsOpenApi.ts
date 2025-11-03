import { SuccessResponseSchema } from "@api/common/commonResponses.js";
import { z } from "zod/v4";
import { ApiProductSchema, PRODUCT_EXAMPLE } from "./apiProduct.js";
import {
	CreateProductV2ParamsSchema,
	UpdateProductV2ParamsSchema,
} from "./productOpModels.js";

// Register schema with .meta() for OpenAPI spec generation
export const ApiProductWithMeta = ApiProductSchema.meta({
	// id: "Product",
	examples: [PRODUCT_EXAMPLE],
});

export const productOps = {
	"/products": {
		get: {
			summary: "List Products",
			tags: ["products"],
			// requestParams: {
			// 	query: z.object({
			// 		customer_id: z.string().optional(),
			// 	}),
			// },
			responses: {
				"200": {
					description: "",
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
					description: "",
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
					description: "",
					content: { "application/json": { schema: ApiProductWithMeta } },
				},
			},
		},
		post: {
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
					description: "",
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
					description: "",
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
