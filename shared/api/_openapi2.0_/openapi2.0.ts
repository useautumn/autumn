import { writeFileSync } from "node:fs";
import yaml from "yaml";
import { createDocument } from "zod-openapi";
import { CustomerDataSchema } from "../common/customerData.js";
import { EntityDataSchema } from "../models.js";
import { coreOps } from "./coreOpenApi.js";
import { ApiCustomerWithMeta, customersOpenApi } from "./customersOpenApi.js";
import { ApiEntityWithMeta, entitiesOpenApi } from "./entitiesOpenApi.js";
import { ApiPlanWithMeta, plansOpenApi } from "./plansOpenApi.js";
import { referralsOpenApi } from "./referralsOpenApi.js";

const openapi2_0 = createDocument(
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
				CustomerData: CustomerDataSchema,
				EntityData: EntityDataSchema,
				Plan: ApiPlanWithMeta,
				Customer: ApiCustomerWithMeta,
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
			...plansOpenApi,
			...customersOpenApi,
			...entitiesOpenApi,
			...referralsOpenApi,
			...coreOps,
		},
	},
	{
		// Disable the "Output" suffix that zod-openapi adds to response schemas
		outputIdSuffix: "",
	},
);

export const writeOpenApi_2_0_0 = () => {
	const yamlContent = yaml.stringify(
		JSON.parse(JSON.stringify(openapi2_0, null, 2)),
	);
	writeFileSync(
		`${process.env.STAINLESS_PATH?.replace("\\ ", " ")}/openapi.yml`,
		yamlContent,
		"utf8",
	);
};
