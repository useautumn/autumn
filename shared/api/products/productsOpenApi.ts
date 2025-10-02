import {
	CreateProductV2ParamsSchema,
	UpdateProductV2ParamsSchema,
} from "@api/models.js";
import { APIProductSchema } from "./apiProduct.js";

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
					content: { "application/json": { schema: APIProductSchema } },
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
					content: { "application/json": { schema: APIProductSchema } },
				},
			},
		},
	},
};
