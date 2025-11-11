import { writeFileSync } from "node:fs";
import {
	getListResponseSchema,
	SuccessResponseSchema,
} from "@api/common/commonResponses.js";
import yaml from "yaml";
import { z } from "zod/v4";
import { createDocument, type ZodOpenApiPathsObject } from "zod-openapi";
import { UpdateBalancesParamsSchema } from "../balances/prevVersions/legacyUpdateBalanceModels.js";
import { SetUsageParamsSchema } from "../balances/usageModels.js";
import { CustomerDataSchema } from "../common/customerData.js";
import { EntityDataSchema } from "../common/entityData.js";
import { setUsageJsDoc } from "../common/jsDocs.js";
import { ApiCusProductV3Schema } from "../customers/cusPlans/previousVersions/apiCusProductV3.js";
import { ApiEntityWithMeta } from "../entities/entitiesOpenApi.js";
import {
	ApiCusFeatureV3Schema,
	ApiCustomerSchema,
	ApiFeatureSchema,
	ApiProductItemSchema,
	ApiProductSchema,
	CreateCustomerParamsSchema,
	CreateCustomerQuerySchema,
	CreateFeatureParamsSchema,
	FEATURE_EXAMPLE,
	GetCustomerQuerySchema,
	ListCustomersResponseSchema,
	PRODUCT_EXAMPLE,
	UpdateCustomerParamsSchema,
	UpdateFeatureParamsSchema,
} from "../models.js";
import {
	CreateProductV2ParamsSchema,
	UpdateProductV2ParamsSchema,
} from "../products/productOpModels.js";

// Register schema with .meta() for OpenAPI spec generation
export const ApiProductWithMeta = ApiProductSchema.meta({
	id: "Product",
	examples: [PRODUCT_EXAMPLE],
});

// Register the schema with .meta() for OpenAPI spec generation
const ApiFeatureWithMeta = ApiFeatureSchema.extend({
	type: z.enum(["boolean", "single_use", "continuous_use", "credit_system"]),
}).meta({
	id: "Feature",
	examples: [FEATURE_EXAMPLE],
});

// Register schema with .meta() for OpenAPI spec generation
const ApiCustomerWithMeta = ApiCustomerSchema.meta({
	id: "Customer",
});

const productOps = {
	"/products": {
		get: {
			summary: "List Products",
			tags: ["products"],
			responses: {
				"200": {
					description: "",
					content: {
						"application/json": {
							schema: z.object({
								list: z.array(ApiProductWithMeta),
							}),
						},
					},
				},
			},
		},
		post: {
			summary: "Create Product",
			tags: ["products"],
			requestBody: {
				content: {
					"application/json": { schema: CreateProductV2ParamsSchema },
				},
			},
			responses: {
				"200": {
					description: "",
					content: { "application/json": { schema: ApiProductWithMeta } },
				},
			},
		},
	},
	"/products/{product_id}": {
		get: {
			summary: "Get Product",
			tags: ["products"],
			requestParams: {
				path: z.object({
					product_id: z.string(),
				}),
			},
			responses: {
				"200": {
					description: "",
					content: { "application/json": { schema: ApiProductWithMeta } },
				},
			},
		},
		post: {
			summary: "Update Product",
			tags: ["products"],
			requestParams: {
				path: z.object({
					product_id: z.string(),
				}),
			},
			requestBody: {
				content: {
					"application/json": { schema: UpdateProductV2ParamsSchema },
				},
			},
			responses: {
				"200": {
					description: "",
					content: { "application/json": { schema: ApiProductWithMeta } },
				},
			},
		},
		delete: {
			summary: "Delete Product",
			tags: ["products"],
			requestParams: {
				path: z.object({
					product_id: z.string(),
				}),
				query: z.object({
					all_versions: z.boolean().optional(),
				}),
			},
			responses: {
				"200": {
					description: "",
					content: {
						"application/json": {
							schema: SuccessResponseSchema,
						},
					},
				},
			},
		},
	},
};

const featureOps = {
	"/features": {
		get: {
			summary: "List Features",
			tags: ["features"],
			responses: {
				"200": {
					description: "",
					content: {
						"application/json": {
							schema: getListResponseSchema({ schema: ApiFeatureWithMeta }),
						},
					},
				},
			},
		},
		post: {
			summary: "Create Feature",
			tags: ["features"],
			requestBody: {
				content: {
					"application/json": { schema: CreateFeatureParamsSchema },
				},
			},
			responses: {
				"200": {
					description: "",
					content: { "application/json": { schema: ApiFeatureWithMeta } },
				},
			},
		},
	},
	"/features/{feature_id}": {
		get: {
			summary: "Get Feature",
			tags: ["features"],
			requestParams: {
				path: z.object({
					feature_id: z.string(),
				}),
			},
			responses: {
				"200": {
					description: "",
					content: { "application/json": { schema: ApiFeatureWithMeta } },
				},
			},
		},
		post: {
			summary: "Update Feature",
			tags: ["features"],
			requestParams: {
				path: z.object({
					feature_id: z.string(),
				}),
			},
			requestBody: {
				content: {
					"application/json": { schema: UpdateFeatureParamsSchema },
				},
			},
			responses: {
				"200": {
					description: "",
					content: { "application/json": { schema: ApiFeatureWithMeta } },
				},
			},
		},
		delete: {
			summary: "Delete Feature",
			tags: ["features"],
			requestParams: {
				path: z.object({
					feature_id: z.string(),
				}),
			},
			responses: {
				"200": {
					description: "",
					content: {
						"application/json": {
							schema: SuccessResponseSchema,
						},
					},
				},
			},
		},
	},
};

const customerOps = {
	"/customers": {
		get: {
			summary: "List Customers",
			tags: ["customers"],
			requestParams: {
				query: z.object({
					limit: z.number().int().min(10).max(100).optional(),
					offset: z.number().int().min(0).optional(),
				}),
			},
			responses: {
				"200": {
					description: "200 OK",
					content: {
						"application/json": { schema: ListCustomersResponseSchema },
					},
				},
			},
		},
		post: {
			summary: "Create Customer",
			tags: ["customers"],
			requestParams: {
				query: CreateCustomerQuerySchema,
			},
			requestBody: {
				content: {
					"application/json": { schema: CreateCustomerParamsSchema },
				},
			},
			responses: {
				"200": {
					description: "200 OK",
					content: { "application/json": { schema: ApiCustomerWithMeta } },
				},
			},
		},
	},
	"/customers/{customer_id}": {
		get: {
			summary: "Get Customer",
			tags: ["customers"],
			requestParams: {
				path: z.object({
					customer_id: z.string(),
				}),
				query: GetCustomerQuerySchema,
			},
			responses: {
				"200": {
					description: "200 OK",
					content: { "application/json": { schema: ApiCustomerWithMeta } },
				},
			},
		},
		post: {
			summary: "Update Customer",
			tags: ["customers"],
			requestParams: {
				path: z.object({
					customer_id: z.string(),
				}),
				query: z.object({
					expand: z.string().optional(),
				}),
			},
			requestBody: {
				content: {
					"application/json": { schema: UpdateCustomerParamsSchema },
				},
			},
			responses: {
				"200": {
					description: "200 OK",
					content: { "application/json": { schema: ApiCustomerWithMeta } },
				},
			},
		},
		delete: {
			summary: "Delete Customer",
			tags: ["customers"],
			requestParams: {
				path: z.object({
					customer_id: z.string(),
				}),
			},
			responses: {
				"200": {
					description: "200 OK",
					content: {
						"application/json": {
							schema: SuccessResponseSchema,
						},
					},
				},
			},
		},
	},
	"/customers/{customer_id}/balances": {
		post: {
			summary: "Set Feature Balances",
			description: "Set the balance of a feature for a specific customer",
			tags: ["customers"],
			requestParams: {
				path: z.object({
					customer_id: z.string(),
				}),
			},
			requestBody: {
				content: {
					"application/json": { schema: UpdateBalancesParamsSchema },
				},
			},
			responses: {
				"200": {
					description: "",
					content: {
						"application/json": { schema: SuccessResponseSchema },
					},
				},
			},
		},
	},
};

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
			...productOps,
			...featureOps,
			...customerOps,
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
