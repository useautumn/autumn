import { writeFileSync } from "node:fs";
import {
	ApiCustomerSchema,
	ApiPlanItemV0WithMeta,
	BaseApiCustomerSchema,
	CustomerDataSchema,
	EntityDataSchema,
} from "@autumn/shared";
import yaml from "yaml";
import { createDocument } from "zod-openapi";
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
				PlanFeature: ApiPlanItemV0WithMeta,
				Customer: ApiCustomerSchema,
				BaseCustomer: BaseApiCustomerSchema,
				Entity: ApiEntityWithMeta,
			},
			parameters: {
				XApiVersion: {
					name: "x-api-version",
					in: "header",
					required: true,
					schema: {
						type: "string",
						default: "2.0",
					},
				},
			},
			securitySchemes: {
				secretKey: {
					type: "http",
					scheme: "bearer",
					bearerFormat: "JWT",
				},
			},
		},
		"x-speakeasy-globals": {
			parameters: [
				{
					$ref: "#/components/parameters/XApiVersion",
					"x-speakeasy-globals-hidden": true,
				},
			],
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

const injectGlobalHeaderParameters = ({
	openApiDocument,
}: {
	openApiDocument: Record<string, unknown>;
}) => {
	const methods = [
		"get",
		"put",
		"post",
		"delete",
		"patch",
		"head",
		"options",
		"trace",
	];
	const headerParamRef = "#/components/parameters/XApiVersion";

	const paths = (openApiDocument.paths ?? {}) as Record<string, unknown>;
	for (const pathItem of Object.values(paths)) {
		if (!pathItem || typeof pathItem !== "object") continue;
		for (const method of methods) {
			const operation = (pathItem as Record<string, unknown>)[method];
			if (!operation || typeof operation !== "object") continue;
			if (!operation) continue;

			const operationRecord = operation as Record<string, unknown>;
			const parameters = Array.isArray(operationRecord.parameters)
				? [...operationRecord.parameters]
				: [];

			const hasXApiVersionParam = parameters.some((parameter) => {
				if (!parameter || typeof parameter !== "object") return false;
				const parameterRecord = parameter as Record<string, unknown>;
				if (parameterRecord.$ref === headerParamRef) return true;
				return (
					parameterRecord.in === "header" &&
					parameterRecord.name === "x-api-version"
				);
			});

			if (!hasXApiVersionParam) {
				parameters.unshift({ $ref: headerParamRef });
			}

			operationRecord.parameters = parameters;
		}
	}
};

export const writeOpenApi_2_0_0 = ({
	outputFilePath,
}: {
	outputFilePath: string;
}) => {
	const openApiDocument = JSON.parse(JSON.stringify(openapi2_0, null, 2));
	injectGlobalHeaderParameters({ openApiDocument });
	const yamlContent = yaml.stringify(openApiDocument);
	writeFileSync(outputFilePath, yamlContent, "utf8");
};
