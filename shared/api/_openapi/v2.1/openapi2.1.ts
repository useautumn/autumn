import { writeFileSync } from "node:fs";
import { CustomerIdSchema } from "@api/common/customerId.js";
import { ApiCustomerV5Schema } from "@api/customers/apiCustomerV5.js";
import { CustomerExpandEnum } from "@api/customers/components/customerExpand/customerExpand.js";
import { CustomerDataSchema } from "@api/models.js";
import { ApiPlanV1Schema } from "@api/products/apiPlanV1.js";
import { OpenAPIGenerator } from "@orpc/openapi";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import yaml from "yaml";
import { v2_1ContractRouter } from "./contracts/index.js";

const generator = new OpenAPIGenerator({
	schemaConverters: [new ZodToJsonSchemaConverter()],
});

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
	const xApiVersionParameter = {
		name: "x-api-version",
		in: "header",
		required: true,
		schema: {
			type: "string",
			default: "2.1",
		},
		"x-speakeasy-globals-hidden": true,
	};

	const paths = (openApiDocument.paths ?? {}) as Record<string, unknown>;
	for (const pathItem of Object.values(paths)) {
		if (!pathItem || typeof pathItem !== "object") continue;
		for (const method of methods) {
			const operation = (pathItem as Record<string, unknown>)[method];
			if (!operation || typeof operation !== "object") continue;

			const operationRecord = operation as Record<string, unknown>;
			const parameters = Array.isArray(operationRecord.parameters)
				? [...operationRecord.parameters]
				: [];

			const hasXApiVersionParam = parameters.some((parameter) => {
				if (!parameter || typeof parameter !== "object") return false;
				const parameterRecord = parameter as Record<string, unknown>;
				return (
					parameterRecord.in === "header" &&
					parameterRecord.name === "x-api-version"
				);
			});

			if (!hasXApiVersionParam) {
				parameters.unshift(xApiVersionParameter);
			}

			operationRecord.parameters = parameters;
		}
	}
};

const applySpeakeasySettings = ({
	openApiDocument,
}: {
	openApiDocument: Record<string, unknown>;
}) => {
	if (
		!openApiDocument.components ||
		typeof openApiDocument.components !== "object"
	) {
		openApiDocument.components = {};
	}

	const components = openApiDocument.components as Record<string, unknown>;

	if (
		!components.securitySchemes ||
		typeof components.securitySchemes !== "object"
	) {
		components.securitySchemes = {};
	}

	(components.securitySchemes as Record<string, unknown>).secretKey = {
		type: "http",
		scheme: "bearer",
		bearerFormat: "JWT",
	};

	openApiDocument.security = [{ secretKey: [] }];
	openApiDocument["x-speakeasy-globals"] = {
		parameters: [
			{
				name: "x-api-version",
				in: "header",
				required: true,
				schema: {
					type: "string",
					default: "2.1",
				},
				"x-speakeasy-globals-hidden": true,
			},
		],
	};
};

const removeInternalFields = ({
	openApiDocument,
}: {
	openApiDocument: Record<string, unknown>;
}) => {
	const isRecord = (value: unknown): value is Record<string, unknown> =>
		typeof value === "object" && value !== null && !Array.isArray(value);

	const isInternalNode = (value: unknown) => {
		if (!isRecord(value)) return false;
		return value.internal === true || value["x-internal"] === true;
	};

	const stripInternalMarkers = (value: Record<string, unknown>) => {
		delete value.internal;
		delete value["x-internal"];
	};

	const sanitizeNode = (node: unknown): void => {
		if (Array.isArray(node)) {
			for (let i = node.length - 1; i >= 0; i--) {
				if (isInternalNode(node[i])) {
					node.splice(i, 1);
					continue;
				}
				sanitizeNode(node[i]);
			}
			return;
		}

		if (!isRecord(node)) return;

		if (isRecord(node.properties)) {
			const properties = node.properties as Record<string, unknown>;
			const requiredSet = Array.isArray(node.required)
				? new Set(
						node.required.filter(
							(requiredKey): requiredKey is string =>
								typeof requiredKey === "string",
						),
					)
				: null;

			for (const [propertyName, propertySchema] of Object.entries(properties)) {
				if (!isInternalNode(propertySchema)) continue;

				delete properties[propertyName];
				requiredSet?.delete(propertyName);
			}

			if (requiredSet) {
				node.required = [...requiredSet];
			}
		}

		if (Array.isArray(node.parameters)) {
			node.parameters = node.parameters.filter(
				(parameter) => !isInternalNode(parameter),
			);
		}

		stripInternalMarkers(node);

		for (const value of Object.values(node)) {
			sanitizeNode(value);
		}
	};

	sanitizeNode(openApiDocument);
};

export const writeOpenApi_2_1_0 = async ({
	outputFilePath,
}: {
	outputFilePath: string;
}) => {
	const openApiDocument = (await generator.generate(v2_1ContractRouter, {
		info: {
			title: "Autumn API",
			version: "2.1.0",
		},
		commonSchemas: {
			CustomerId: {
				schema: CustomerIdSchema,
				strategy: "input",
			},
			CustomerData: {
				schema: CustomerDataSchema,
				strategy: "input",
			},
			CustomerExpand: {
				schema: CustomerExpandEnum,
				strategy: "input",
			},
			Customer: {
				schema: ApiCustomerV5Schema,
				strategy: "output",
			},
			Plan: {
				schema: ApiPlanV1Schema,
				strategy: "output",
			},
		},
		servers: [
			{
				// url: "https://api.useautumn.com/v1",
				url: "http://localhost:8080",
				description: "Production server",
			},
		],
	})) as Record<string, unknown>;

	applySpeakeasySettings({ openApiDocument });
	injectGlobalHeaderParameters({ openApiDocument });
	removeInternalFields({ openApiDocument });

	const yamlContent = yaml.stringify(openApiDocument);
	writeFileSync(outputFilePath, yamlContent, "utf8");
};
