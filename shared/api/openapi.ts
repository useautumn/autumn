import { writeFileSync } from "node:fs";
import { AppEnv } from "@models/genModels/genEnums.js";
import yaml from "yaml";
import { z } from "zod/v4";
import { createDocument } from "zod-openapi";
import { coreOps } from "./core/coreOpenApi.js";
import { customerOps } from "./customers/customersOpenApi.js";
import { entityOps } from "./entities/entitiesOpenApi.js";
import { featureOps } from "./features/featuresOpenApi.js";
import { productOps } from "./products/productsOpenApi.js";

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
					env: z.nativeEnum(AppEnv),
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
		...productOps,
		...coreOps,
		...featureOps,
		...customerOps,
		...entityOps,
	},
});

// Export to YAML file during build
if (process.env.NODE_ENV !== "production") {
	try {
		// Export as JSON (YAML export has issues with zod schemas)
		const jsonStr = JSON.stringify(document, null, 2);
		writeFileSync("./openapi.json", jsonStr, "utf8");
		console.log("OpenAPI document exported to openapi.json");

		// TODO: Fix YAML export - currently fails with "Tag not resolved for Function value"
		// const yamlContent = yaml.stringify(document);
		// writeFileSync("./openapi.yaml", yamlContent, "utf8");
		// console.log("OpenAPI document exported to openapi.yaml");
	} catch (error) {
		console.error("Failed to export OpenAPI document:", error);
	}
}
