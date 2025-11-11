// import "dotenv/config";
// import { execSync } from "node:child_process";
// import { existsSync, writeFileSync } from "node:fs";
// import yaml from "yaml";
// import { createDocument } from "zod-openapi";
// import { OPENAPI_1_2_0 } from "./_prevVersions/openapi1.2.0.js";
// import { CustomerDataSchema } from "./common/customerData.js";
// import { EntityDataSchema } from "./common/entityData.js";
// import { coreOps } from "./core/coreOpenApi.js";

// import {
// 	ApiCustomerWithMeta,
// 	customerOps,
// } from "./customers/customersOpenApi.js";
// import { ApiEntityWithMeta } from "./entities/entitiesOpenApi.js";
// import { ApiFeatureWithMeta, featureOps } from "./features/featuresOpenApi.js";
// import { ApiProductItemSchema } from "./products/apiProductItem.js";
// import { ApiProductWithMeta, productOps } from "./products/productsOpenApi.js";

// const API_VERSION = "1.2.0";

// const document = createDocument(
// 	{
// 		openapi: "3.1.0",
// 		info: {
// 			title: "Autumn API",
// 			version: API_VERSION,
// 		},

// 		servers: [
// 			{
// 				url: "https://api.useautumn.com",
// 				description: "Production server",
// 			},
// 		],

// 		security: [
// 			{
// 				secretKey: [],
// 			},
// 		],
// 		components: {
// 			schemas: {
// 				CustomerData: CustomerDataSchema,
// 				EntityData: EntityDataSchema.meta({
// 					id: "EntityData",
// 					description: "Entity data for creating an entity",
// 				}),
// 				Customer: ApiCustomerWithMeta,
// 				CustomerProduct: ApiCusProductSchema,

// 				Product: ApiProductWithMeta,
// 				ProductItem: ApiProductItemSchema,
// 				Feature: ApiFeatureWithMeta,
// 				Entity: ApiEntityWithMeta,
// 			},
// 			securitySchemes: {
// 				secretKey: {
// 					type: "http",
// 					scheme: "bearer",
// 					bearerFormat: "JWT",
// 				},
// 			},
// 		},

// 		paths: {
// 			...coreOps,
// 			...customerOps,
// 			...productOps,
// 			...featureOps,
// 			// ...entityOps,
// 			// ...referralOps,
// 		},
// 	},
// 	{
// 		// Disable the "Output" suffix that zod-openapi adds to response schemas
// 		outputIdSuffix: "",
// 	},
// );

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { writeOpenApi_1_2_0 } from "./_prevVersions/openapi1.2.0.js";

// import { OPENAPI_1_2_0 } from "./_prevVersions/openapi1.2.0.js";

// Export to YAML file during build
if (process.env.NODE_ENV !== "production") {
	try {
		// If --no-build flag is present, return after writing openapi.yml
		if (process.argv.includes("--no-build")) {
			writeOpenApi_1_2_0();
			console.log(
				`OpenAPI document exported to ${process.env.STAINLESS_PATH}/openapi.yml`,
			);
			process.exit(0);
		}
		// Convert to JSON first to strip out Zod schemas and function references

		if (process.env.STAINLESS_PATH) {
			writeOpenApi_1_2_0();
			// writeFileSync(
			// 	`${process.env.STAINLESS_PATH.replace("\\ ", " ")}/openapi.yml`,
			// 	yamlContent,
			// 	"utf8",
			// );

			// console.log(
			// 	`OpenAPI document exported to ${process.env.STAINLESS_PATH}/openapi.yml`,
			// );

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

		// If docs path, run bun pull to update documentation
		if (process.env.DOCS_PATH) {
			const docsPath = process.env.DOCS_PATH.replace("\\ ", " ");
			try {
				console.log("Updating documentation with Mintlify...");
				execSync("bun pull", {
					stdio: "inherit",
					cwd: docsPath,
				});
				console.log("Documentation updated successfully");
			} catch (error) {
				console.error("Failed to update documentation:", error);
			}
		}
	} catch (error) {
		console.error("Failed to export OpenAPI document:", error);
		process.exit(1);
	}

	// Exit the process after completion
	process.exit(0);
}
