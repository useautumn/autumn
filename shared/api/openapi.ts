import { writeFileSync } from "node:fs";
import { AppEnv } from "@models/genModels/genEnums.js";
import yaml from "yaml";
import { z } from "zod/v4";
import { createDocument } from "zod-openapi";
import { APIProductSchema } from "./products/apiProduct.js";
import { CreateProductParamsSchema } from "./products/operations/createProductParams.js";

const API_VERSION = "1.2.0";

const document = createDocument({
	openapi: "3.1.0",
	info: {
		title: "Autumn API",
		version: API_VERSION,
	},

	servers: [
		{
			url: "https://api.useautumn.com",
			description: "Production server",
		},
	],

	security: [
		{
			secretKey: [],
		},
	],
	components: {
		schemas: {
			autumnError: z
				.object({
					message: z.string(),
					code: z.string(),
					env: z.enum(AppEnv),
				})
				.meta({
					id: "AutumnError",
					description: "An error that occurred in the API",
				}),
		},
		securitySchemes: {
			secretKey: {
				type: "http",
				scheme: "bearer",
				bearerFormat: "JWT",
			},
		},
	},

	paths: {
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
						content: {
							"application/json": { schema: APIProductSchema },
						},
					},
				},
				// responses: withErrorResponses({
				// 	"200": {
				// 		description: "200 OK",
				// 		content: {
				// 			"application/json": { schema: APIProductSchema },
				// 		},
				// 	},
				// }),
			},
		},
	},
});

// Export to YAML file during build
if (process.env.NODE_ENV !== "production") {
	try {
		const yamlContent = yaml.stringify(document);
		writeFileSync("./openapi.yaml", yamlContent, "utf8");
		console.log("OpenAPI document exported to openapi-customer.yaml");
	} catch (error) {
		console.error("Failed to export OpenAPI document:", error);
	}
}
