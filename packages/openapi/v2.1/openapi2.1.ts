import { writeFileSync } from "node:fs";
import { SuccessResponseSchema } from "@api/common/commonResponses.js";
import {
	ApiBalanceV1Schema,
	ApiCustomerV5Schema,
	ApiPlanV1Schema,
	AttachParamsV1Schema,
	AttachPreviewResponseSchema,
	BaseApiCustomerSchema,
	BillingResponseSchema,
	CheckParamsSchema,
	CheckResponseV3Schema,
	CreateBalanceParamsV0Schema,
	CreateCustomerParamsV1Schema,
	CustomerDataSchema,
	CustomerExpandEnum,
	CustomerIdSchema,
	PreviewUpdateSubscriptionResponseSchema,
	SetupPaymentParamsSchema,
	SetupPaymentResultSchema,
	TrackParamsSchema,
	TrackResponseV3Schema,
	UpdateBalanceParamsV0Schema,
	UpdateSubscriptionV1ParamsSchema,
} from "@autumn/shared";

import { OpenAPIGenerator } from "@orpc/openapi";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import yaml from "yaml";
import { transformNode } from "../utils/mintlifyTransform/index.js";
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

/**
 * Generates the OpenAPI document with all transformations applied.
 * Internal helper used by both writeOpenApi_2_1_0 and writeOpenApi_2_1_0_Stripped.
 */
async function generateOpenApiDocument(): Promise<Record<string, unknown>> {
	// Register internal schemas before generation so they get x-internal: true
	// in the OpenAPI output, which removeInternalFields() will then strip
	registerInternalSchemas(BaseApiCustomerSchema);
	registerInternalSchemas(CreateCustomerParamsV1Schema);
	registerInternalSchemas(AttachParamsV1Schema);
	registerInternalSchemas(UpdateSubscriptionV1ParamsSchema);
	registerInternalSchemas(SetupPaymentParamsSchema);
	registerInternalSchemas(CreateBalanceParamsV0Schema);
	registerInternalSchemas(UpdateBalanceParamsV0Schema);
	registerInternalSchemas(CheckParamsSchema);
	registerInternalSchemas(TrackParamsSchema);
	registerInternalSchemas(BillingResponseSchema);
	registerInternalSchemas(AttachPreviewResponseSchema);
	registerInternalSchemas(PreviewUpdateSubscriptionResponseSchema);
	registerInternalSchemas(SetupPaymentResultSchema);
	registerInternalSchemas(SuccessResponseSchema);
	registerInternalSchemas(ApiCustomerV5Schema);
	registerInternalSchemas(ApiBalanceV1Schema);
	registerInternalSchemas(ApiPlanV1Schema);
	registerInternalSchemas(CheckResponseV3Schema);
	registerInternalSchemas(TrackResponseV3Schema);
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
			Balance: {
				schema: ApiBalanceV1Schema,
				strategy: "output",
			},
		},
		servers: [
			{
				// url: "http://localhost:8080",
				url: "https://api.useautumn.com",
				description: "Production server",
			},
		],
	})) as Record<string, unknown>;

	applySpeakeasySettings({ openApiDocument, version: "2.1" });
	injectGlobalHeaderParameters({ openApiDocument, version: "2.1" });
	removeInternalFields({ openApiDocument });

	return openApiDocument;
}

/**
 * Generates and writes the full OpenAPI spec (with TypeScript JSDoc examples).
 * Used for the TypeScript SDK generation.
 */
export const writeOpenApi_2_1_0 = async ({
	outputFilePath,
}: {
	outputFilePath: string;
}) => {
	const openApiDocument = await generateOpenApiDocument();
	const yamlContent = yaml.stringify(openApiDocument);
	writeFileSync(outputFilePath, yamlContent, "utf8");
};

/**
 * Generates and writes the stripped OpenAPI spec (JSDoc examples removed).
 * Used for non-TypeScript SDK generation (Python, etc.) where TS examples
 * in descriptions would be confusing.
 */
export const writeOpenApi_2_1_0_Stripped = async ({
	outputFilePath,
}: {
	outputFilePath: string;
}) => {
	const openApiDocument = await generateOpenApiDocument();

	// Strip JSDoc tags (@example, @param, etc.) from descriptions
	const schemas = (openApiDocument.components as Record<string, unknown>)
		?.schemas as Record<string, unknown> | undefined;
	transformNode(openApiDocument, schemas);

	const yamlContent = yaml.stringify(openApiDocument);
	writeFileSync(outputFilePath, yamlContent, "utf8");
};
