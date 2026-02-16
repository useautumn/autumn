import { writeFileSync } from "node:fs";
import {
	ApiCustomerV5Schema,
	ApiPlanV1Schema,
	AttachParamsV0Schema,
	BaseApiCustomerSchema,
	BillingResponseSchema,
	CreateCustomerParamsV1Schema,
	CustomerDataSchema,
	CustomerExpandEnum,
	CustomerIdSchema,
} from "@autumn/shared";

import { OpenAPIGenerator } from "@orpc/openapi";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import yaml from "yaml";
import {
	applySpeakeasySettings,
	injectGlobalHeaderParameters,
	removeInternalFields,
} from "../utils/openapiTransform/index.js";
import { registerInternalSchemas } from "../utils/registerInternalSchemas.js";
import { v2_1ContractRouter } from "./contracts/index.js";

const generator = new OpenAPIGenerator({
	schemaConverters: [new ZodToJsonSchemaConverter()],
});

export const writeOpenApi_2_1_0 = async ({
	outputFilePath,
}: {
	outputFilePath: string;
}) => {
	// Register internal schemas before generation so they get x-internal: true
	// in the OpenAPI output, which removeInternalFields() will then strip
	registerInternalSchemas(BaseApiCustomerSchema);
	registerInternalSchemas(CreateCustomerParamsV1Schema);
	registerInternalSchemas(AttachParamsV0Schema);
	registerInternalSchemas(BillingResponseSchema);
	registerInternalSchemas(ApiCustomerV5Schema);
	registerInternalSchemas(ApiPlanV1Schema);
	registerInternalSchemas(CustomerDataSchema);

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

	applySpeakeasySettings({ openApiDocument, version: "2.1" });
	injectGlobalHeaderParameters({ openApiDocument, version: "2.1" });
	removeInternalFields({ openApiDocument });

	const yamlContent = yaml.stringify(openApiDocument);
	writeFileSync(outputFilePath, yamlContent, "utf8");
};
