import { writeFileSync } from "node:fs";
import { SuccessResponseSchema } from "@api/common/commonResponses.js";
import { ExtEventsAggregateParamsSchema } from "@api/events/aggregate/eventsAggregateParams.js";
import {
	ApiBalanceV1Schema,
	ApiCustomerV5Schema,
	ApiEventsListV2_3ParamsSchema,
	ApiPlanV1Schema,
	ApiPlanVariantV1Schema,
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
import { GetCatalogResponseSchema } from "../../../shared/api/catalogV2/getCatalogResponse.js";
import { UpdateCatalogParamsSchema } from "../../../shared/api/catalogV2/updateCatalogParams.js";
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

const OPENAPI_MAX_STRUCTURE_DEPTH = 20;

const generator = new OpenAPIGenerator({
	// Speakeasy Python ordering bug, so the limit is raised.
	schemaConverters: [
		new ZodToJsonSchemaConverter({
			maxStructureDepth: OPENAPI_MAX_STRUCTURE_DEPTH,
		}),
	],
});

const OPENAPI_DOC_VERSION = LATEST_VERSION;

async function generateOpenApiDocument({
	router = v2_3ContractRouter,
	stripInternal = true,
	includeWebhooks = true,
}: {
	router?: unknown;
	stripInternal?: boolean;
	includeWebhooks?: boolean;
} = {}): Promise<Record<string, unknown>> {
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
	registerInternalSchemas(ApiPlanVariantV1Schema.shape.mapping_identity);
	registerInternalSchemas(CheckResponseV3Schema);
	registerInternalSchemas(TrackResponseV3Schema);
	registerInternalSchemas(CustomerDataSchema);
	registerInternalSchemas(ApiEventsListV2_3ParamsSchema);
	registerInternalSchemas(ExtEventsAggregateParamsSchema);
	registerInternalSchemas(DfuFlashParamsSchema);
	registerInternalSchemas(InsertInvoicesParamsSchema);
	if (!stripInternal) {
		registerInternalSchemas(UpdateCatalogParamsSchema, { mappingOnly: true });
		registerInternalSchemas(GetCatalogResponseSchema, { mappingOnly: true });
	}

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
				url: "https://api.useautumn.com",
				description: "Production server",
			},
		],
	})) as Record<string, unknown>;

	openApiDocument.openapi = "3.1.0";

	applySpeakeasySettings({
		openApiDocument,
		version: OPENAPI_DOC_VERSION,
	});
	injectGlobalHeaderParameters({
		openApiDocument,
		version: OPENAPI_DOC_VERSION,
	});
	if (includeWebhooks) injectWebhooks({ openApiDocument });
	if (stripInternal) removeInternalFields({ openApiDocument });
	applyPaginationExtensions({ openApiDocument });

	return openApiDocument;
}

const stringifySpec = (document: unknown) =>
	yaml.stringify(document, { aliasDuplicateObjects: false });

export const writeLatestOpenApi = async ({
	outputFilePath,
}: {
	outputFilePath: string;
}) => {
	const openApiDocument = await generateOpenApiDocument();
	const yamlContent = stringifySpec(openApiDocument);
	writeFileSync(outputFilePath, yamlContent, "utf8");
};

export const writeLatestOpenApiStripped = async ({
	outputFilePath,
}: {
	outputFilePath: string;
}) => {
	const openApiDocument = await generateOpenApiDocument();

	const schemas = (openApiDocument.components as Record<string, unknown>)
		?.schemas as Record<string, unknown> | undefined;
	transformNode(openApiDocument, schemas);

	const yamlContent = stringifySpec(openApiDocument);
	writeFileSync(outputFilePath, yamlContent, "utf8");
};

export const writeLatestOpenApiInternal = async ({
	outputFilePath,
}: {
	outputFilePath: string;
}) => {
	const openApiDocument = await generateOpenApiDocument({
		router: v2_3InternalContractRouter,
		stripInternal: false,
		includeWebhooks: false,
	});
	const yamlContent = stringifySpec(openApiDocument);
	writeFileSync(outputFilePath, yamlContent, "utf8");
};
