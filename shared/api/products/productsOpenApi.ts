import {
	CreateProductV2ParamsSchema,
	UpdateProductV2ParamsSchema,
} from "@api/models.js";
import { ApiProductSchema } from "./apiProduct.js";

// Register schema with .meta() for OpenAPI spec generation
const ApiProductWithMeta = ApiProductSchema.meta({
	id: "Product",
	description: "A product",
});

export const productOps = {
	"/products": {
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
		patch: {
			summary: "Update Product",
			tags: ["products"],
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
	},
};
