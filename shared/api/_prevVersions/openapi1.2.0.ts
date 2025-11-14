import { writeFileSync } from "node:fs";
import { SuccessResponseSchema } from "@api/common/commonResponses.js";
import yaml from "yaml";
import { createDocument, type ZodOpenApiPathsObject } from "zod-openapi";
// import { UpdateBalancesParamsSchema } from "../balances/updateBalanceModels.js";
import { SetUsageParamsSchema } from "../balances/usageModels.js";
import { CustomerDataSchema } from "../common/customerData.js";
import { EntityDataSchema } from "../common/entityData.js";
import { setUsageJsDoc } from "../common/jsDocs.js";

// import { ApiEntityWithMeta } from "../entities/entitiesOpenApi.js";

import {
	ApiEntityWithMeta,
	entitiesOpenApi,
} from "../_openapi/prevVersions/entitiesOpenApi.js";
import {
	ApiCustomerWithMeta,
	customersOpenApi,
} from "../_openapi/prevVersions/openapi1.2/customersOpenApi.js";
import {
	ApiFeatureWithMeta,
	featuresOpenApi,
} from "../_openapi/prevVersions/openapi1.2/featuresOpenApi.js";
import {
	ApiProductWithMeta,
	productsOpenApi,
} from "../_openapi/prevVersions/openapi1.2/productsOpenApi.js";
import { ApiCusFeatureV3Schema } from "../customers/cusFeatures/previousVersions/apiCusFeatureV3.js";
import { ApiCusProductV3Schema } from "../customers/cusPlans/previousVersions/apiCusProductV3.js";
import { ApiProductItemSchema } from "../products/planFeature/previousVersions/apiProductItem.js";

const coreOps: ZodOpenApiPathsObject = {
	"/usage": {
		post: {
			summary: "Set Usage",
			description: setUsageJsDoc,
			tags: ["core"],
			requestBody: {
				content: {
					"application/json": { schema: SetUsageParamsSchema },
				},
			},
			responses: {
				"200": {
					description: "",
					content: { "application/json": { schema: SuccessResponseSchema } },
				},
			},
		},
	},
};

const OPENAPI_1_2_0 = createDocument(
	{
		openapi: "3.1.0",
		info: {
			title: "Autumn API",
			version: "1.2.0",
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
				CustomerData: CustomerDataSchema.meta({
					id: "CustomerData",
					description:
						"Used to add customer details like name or email when auto-creating a customer.",
				}),
				EntityData: EntityDataSchema.meta({
					id: "EntityData",
					description: "Entity data for creating an entity",
				}),
				Customer: ApiCustomerWithMeta,
				CustomerProduct: ApiCusProductV3Schema.meta({
					id: "CustomerProduct",
					description: "Customer product object returned by the API",
				}),
				CustomerFeature: ApiCusFeatureV3Schema.meta({
					id: "CustomerFeature",
					description: "Customer feature object returned by the API",
				}),
				Product: ApiProductWithMeta,
				ProductItem: ApiProductItemSchema.meta({
					id: "ProductItem",
					description:
						"Product item defining features and pricing within a product",
				}),
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
			...productsOpenApi,
			...featuresOpenApi,
			...customersOpenApi,
			...entitiesOpenApi,
			...coreOps,
		},
	},
	{
		// Disable the "Output" suffix that zod-openapi adds to response schemas
		outputIdSuffix: "",
	},
);

export const writeOpenApi_1_2_0 = () => {
	const yamlContent = yaml.stringify(
		JSON.parse(JSON.stringify(OPENAPI_1_2_0, null, 2)),
	);
	writeFileSync(
		`${process.env.STAINLESS_PATH?.replace("\\ ", " ")}/openapi.yml`,
		yamlContent,
		"utf8",
	);
};
