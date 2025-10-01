import { APIProductSchema } from "./apiProduct.js";
import { CreateProductParamsSchema } from "./operations/createProductParams.js";

export const productOps = {
	"/products": {
		post: {
			summary: "Create Product",
			tags: ["products"],
			requestBody: {
				content: {
					"application/json": { schema: CreateProductParamsSchema },
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
