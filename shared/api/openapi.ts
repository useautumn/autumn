import "dotenv/config";
import { execSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { AppEnv } from "@models/genModels/genEnums.js";
import yaml from "yaml";
import { z } from "zod/v4";
import { createDocument } from "zod-openapi";
import { CustomerDataSchema } from "./common/customerData.js";
import { EntityDataSchema } from "./common/entityData.js";
import { coreOps } from "./core/coreOpenApi.js";
import { ApiCusFeatureSchema } from "./customers/cusFeatures/apiCusFeature.js";
import { ApiCusProductSchema } from "./customers/cusProducts/apiCusProduct.js";
import {
	ApiCustomerWithMeta,
	customerOps,
} from "./customers/customersOpenApi.js";
import { ApiEntityWithMeta, entityOps } from "./entities/entitiesOpenApi.js";
import { ApiFeatureWithMeta, featureOps } from "./features/featuresOpenApi.js";
import { ApiProductItemWithMeta } from "./products/apiProductItem.js";
import { ApiProductWithMeta, productOps } from "./products/productsOpenApi.js";
import { referralOps } from "./referrals/referralsOpenApi.js";

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
			AutumnError: z
				.object({
					message: z.string(),
					code: z.string(),
					env: z.enum(AppEnv),
				})
				.meta({
					id: "AutumnError",
					description: "An error that occurred in the API",
				}),
			CustomerData: CustomerDataSchema.meta({
				id: "CustomerData",
				description: "Customer data for creating or updating a customer",
			}),
			EntityData: EntityDataSchema.meta({
				id: "EntityData",
				description: "Entity data for creating an entity",
			}),
			Customer: ApiCustomerWithMeta,
			CustomerProduct: ApiCusProductSchema,
			CustomerFeature: ApiCusFeatureSchema.meta({
				id: "CustomerFeature",
				description: "Customer feature object returned by the API",
			}),
			Product: ApiProductWithMeta,
			ProductItem: ApiProductItemWithMeta,
			Feature: ApiFeatureWithMeta,
			Entity: ApiEntityWithMeta,
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
		...referralOps,
	},
});

// Export to YAML file during build
if (process.env.NODE_ENV !== "production") {
	try {
		// Convert to JSON first to strip out Zod schemas and function references
		const jsonStr = JSON.stringify(document, null, 2);

		// Convert JSON to YAML (this avoids function serialization issues)
		const jsonObj = JSON.parse(jsonStr);
		const yamlContent = yaml.stringify(jsonObj);

		if (process.env.STAINLESS_PATH) {
			writeFileSync(
				`${process.env.STAINLESS_PATH.replace("\\ ", " ")}/openapi.yml`,
				yamlContent,
				"utf8",
			);

			console.log(
				`OpenAPI document exported to ${process.env.STAINLESS_PATH}/openapi.yml`,
			);

			// Run the run.sh script if it exists
			const runScriptPath = `${process.env.STAINLESS_PATH.replace("\\ ", " ")}/run.sh`;
			const runStainless = !process.argv.includes("--noEmit");
			if (existsSync(runScriptPath) && runStainless) {
				try {
					console.log("Running Stainless generation script...");
					execSync(`chmod +x "${runScriptPath}" && "${runScriptPath}"`, {
						stdio: "inherit",
						cwd: process.env.STAINLESS_PATH,
					});
					console.log("Stainless generation completed successfully");
				} catch (error) {
					console.error("Failed to run Stainless generation script:", error);
				}
			} else
				console.log(
					`\n${!runStainless ? "Stainless generation skipped due to --noEmit flag" : "Stainless generation script not found"}`,
				);
		}
	} catch (error) {
		console.error("Failed to export OpenAPI document:", error);
		process.exit(1);
	}

	// Exit the process after completion
	process.exit(0);
}
