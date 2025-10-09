import { SuccessResponseSchema } from "@api/common/commonResponses.js";
import {
	CreateProductV2ParamsSchema,
	UpdateProductV2ParamsSchema,
} from "@api/models.js";
import { z } from "zod/v4";
import { ApiProductSchema } from "./apiProduct.js";

// Register schema with .meta() for OpenAPI spec generation
const ApiProductWithMeta = ApiProductSchema.meta({
	id: "Product",
	description: "A product",
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
				"404": {
					description: "Product not found",
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
				query: z.object({
					version: z.string().optional(),
					upsert: z.string().optional(),
					disable_version: z.string().optional(),
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
				"404": {
					description: "Product not found",
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
				"400": {
					description:
						"Product cannot be deleted because it has been attached to customers",
				},
				"404": {
					description: "Product not found",
				},
			},
		},
	},
};
