import { writeFileSync } from "node:fs";
import { ApiPlanFeatureWithMeta } from "@api/products/planFeature/apiPlanFeature.js";
import yaml from "yaml";
import { createDocument } from "zod-openapi";
import { CustomerDataSchema } from "../common/customerData.js";
import {
	ApiCustomerV4Schema,
	BaseApiCustomerV4Schema,
	EntityDataSchema,
} from "../models.js";
import { balancesOpenApi } from "./balancesOpenApi.js";
import { coreOps } from "./coreOpenApi.js";
import { customersOpenApi } from "./customersOpenApi.js";
import { ApiEntityWithMeta, entitiesOpenApi } from "./entitiesOpenApi.js";
import { eventsOpenApi } from "./eventsOpenApi.js";
import { ApiPlanWithMeta, plansOpenApi } from "./plansOpenApi.js";
import { referralOps } from "./referralsOpenApi.js";

const openapi2_0 = createDocument(
	{
		openapi: "3.1.0",
		info: {
			title: "Autumn API",
			version: "2.0.0",
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
				EntityData: EntityDataSchema,
				Plan: ApiPlanWithMeta,
				PlanFeature: ApiPlanFeatureWithMeta,
				Customer: ApiCustomerV4Schema,
				BaseCustomer: BaseApiCustomerV4Schema,
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
			...referralOps,
			...coreOps,
			...balancesOpenApi,
			...eventsOpenApi,
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
