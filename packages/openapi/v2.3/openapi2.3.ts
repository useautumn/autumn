import { writeFileSync } from "node:fs";
import { SuccessResponseSchema } from "@api/common/commonResponses.js";
import {
	ApiBalanceV1Schema,
	ApiCustomerV5Schema,
	ApiEventsListV2_3ParamsSchema,
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
	DfuFlashParamsSchema,
	GetCustomerParamsV1Schema,
	InsertInvoicesParamsSchema,
	LATEST_VERSION,
	PreviewUpdateSubscriptionResponseSchema,
	SetupPaymentParamsV1Schema,
	SetupPaymentResponseV1Schema,
	TrackParamsSchema,
	TrackResponseV3Schema,
	TrackTokensParamsSchema,
	UpdateBalanceParamsV0Schema,
	UpdateSubscriptionV1ParamsSchema,
} from "@autumn/shared";

import { OpenAPIGenerator } from "@orpc/openapi";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import yaml from "yaml";
import { transformNode } from "../utils/mintlifyTransform/index.js";
import {
	applyPaginationExtensions,
	applySpeakeasySettings,
	injectGlobalHeaderParameters,
	removeInternalFields,
} from "../utils/openapiTransform/index.js";
import { registerInternalSchemas } from "../utils/registerInternalSchemas.js";
import {
	v2_3ContractRouter,
	v2_3InternalContractRouter,
} from "./contracts/index.js";
import { injectWebhooks } from "./webhooks/injectWebhooks.js";

const generator = new OpenAPIGenerator({
	schemaConverters: [new ZodToJsonSchemaConverter()],
});

const OPENAPI_DOC_VERSION = LATEST_VERSION;

/**
 * Generates the OpenAPI document with all transformations applied.
 *
 * `router` and `stripInternal` are the only things that vary: the published
 * outputs use the public router and strip internal fields, while
 * `openapi-internal.yml` uses the internal router and keeps them, because the
 * atmn generator needs `internal_id`, `variants`, `licenses` and
 * `base_variant_id` to build the CLI's fixtures.
 */
async function generateOpenApiDocument({
	router = v2_3ContractRouter,
	stripInternal = true,
	includeWebhooks = true,
}: {
	router?: unknown;
	stripInternal?: boolean;
	includeWebhooks?: boolean;
} = {}): Promise<Record<string, unknown>> {
	// Register internal schemas before generation so they get x-internal: true
	// in the OpenAPI output, which removeInternalFields() will then strip
	registerInternalSchemas(BaseApiCustomerSchema);
	registerInternalSchemas(CreateCustomerParamsV1Schema);
	registerInternalSchemas(GetCustomerParamsV1Schema);
	registerInternalSchemas(AttachParamsV1Schema);
	registerInternalSchemas(UpdateSubscriptionV1ParamsSchema);
	registerInternalSchemas(SetupPaymentParamsV1Schema);
	registerInternalSchemas(CreateBalanceParamsV0Schema);
	registerInternalSchemas(UpdateBalanceParamsV0Schema);
	registerInternalSchemas(CheckParamsSchema);
	registerInternalSchemas(TrackParamsSchema);
	registerInternalSchemas(TrackTokensParamsSchema);
	registerInternalSchemas(BillingResponseSchema);
	registerInternalSchemas(AttachPreviewResponseSchema);
	registerInternalSchemas(PreviewUpdateSubscriptionResponseSchema);
	registerInternalSchemas(SetupPaymentResponseV1Schema);
	registerInternalSchemas(SuccessResponseSchema);
	registerInternalSchemas(ApiCustomerV5Schema);
	registerInternalSchemas(ApiBalanceV1Schema);
	registerInternalSchemas(ApiPlanV1Schema);
	registerInternalSchemas(CheckResponseV3Schema);
	registerInternalSchemas(TrackResponseV3Schema);
	registerInternalSchemas(CustomerDataSchema);
	registerInternalSchemas(ApiEventsListV2_3ParamsSchema);
	registerInternalSchemas(DfuFlashParamsSchema);
	registerInternalSchemas(InsertInvoicesParamsSchema);

	const openApiDocument = (await generator.generate(router as never, {
		info: {
			title: "Autumn API",
			version: OPENAPI_DOC_VERSION,
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

	// Mintlify only supports OpenAPI 3.0 and 3.1.0; @orpc/openapi defaults to 3.1.1.
	openApiDocument.openapi = "3.1.0";

	applySpeakeasySettings({
		openApiDocument,
		version: OPENAPI_DOC_VERSION,
	});
	injectGlobalHeaderParameters({
		openApiDocument,
		version: OPENAPI_DOC_VERSION,
	});
	// Webhooks first: injectWebhooks builds its own schemas, so injecting after
	// the sanitiser left that whole subtree carrying internal fields.
	if (includeWebhooks) injectWebhooks({ openApiDocument });
	if (stripInternal) removeInternalFields({ openApiDocument });
	applyPaginationExtensions({ openApiDocument });

	return openApiDocument;
}

/**
 * Generates and writes the full OpenAPI spec (with TypeScript JSDoc examples).
 * Used for the TypeScript SDK generation.
 */
export const writeOpenApi_2_3_0 = async ({
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
export const writeOpenApi_2_3_0_Stripped = async ({
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

/**
 * Generates and writes the INTERNAL OpenAPI spec: the public surface plus
 * catalogV2, with internal fields intact. Read by the atmn generator, never
 * published — not fed to the SDKs and not merged into the docs spec.
 */
export const writeOpenApi_2_3_0_Internal = async ({
	outputFilePath,
}: {
	outputFilePath: string;
}) => {
	const openApiDocument = await generateOpenApiDocument({
		router: v2_3InternalContractRouter,
		stripInternal: false,
		// Webhooks are not part of the CLI's surface, and this spec skips
		// sanitising, so including them would carry internal fields for nothing.
		includeWebhooks: false,
	});
	const yamlContent = yaml.stringify(openApiDocument);
	writeFileSync(outputFilePath, yamlContent, "utf8");
};
