import { writeFileSync } from "node:fs";
import yaml from "yaml";
import { createDocument } from "zod-openapi";

import { CustomerDataSchema } from "../../../common/customerData.js";
import { EntityDataSchema } from "../../../common/entityData.js";
import { ApiCusProductV3Schema } from "../../../customers/cusPlans/previousVersions/apiCusProductV3.js";
import {
	ApiCusFeatureV3Schema,
	ApiProductItemSchema,
} from "../../../models.js";
import { balancesOpenApi } from "./balancesOpenApi1.2.0.js";
import { coreOpenApi } from "./coreOpenApi.js";
import { ApiCustomerWithMeta, customersOpenApi } from "./customersOpenApi.js";
import { ApiEntityWithMeta, entitiesOpenApi } from "./entitiesOpenApi.js";
import { eventsOpenApi } from "./eventsOpenApi.js";
import { ApiFeatureWithMeta, featuresOpenApi } from "./featuresOpenApi.js";
import { ApiProductWithMeta, productsOpenApi } from "./productsOpenApi.js";
import { referralsOpenApi } from "./referralsOpenApi.js";

// Register schema with .meta() for OpenAPI spec generation

const OPENAPI_1_2_0 = createDocument(
	{
		openapi: "3.1.0",
		info: {
			title: "Autumn API",
			version: "1.2.0",
		},

		servers: [
			{
				url: "https://api.useautumn.com/v1",
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
				CustomerData: CustomerDataSchema,
				EntityData: EntityDataSchema.meta({
					id: "EntityData",
					description: "Entity data for creating an entity",
				}),
				Customer: ApiCustomerWithMeta,
				CustomerProduct: ApiCusProductV3Schema,
				CustomerFeature: ApiCusFeatureV3Schema.meta({
					id: "CustomerFeature",
					description: "Customer feature object returned by the API",
				}),
				Product: ApiProductWithMeta,
				ProductItem: ApiProductItemSchema,
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
			...coreOpenApi,
			...customersOpenApi,
			...entitiesOpenApi,
			...eventsOpenApi,
			...balancesOpenApi,
			...referralsOpenApi,
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
