import { z } from "zod/v4";
import { SuccessResponseSchema } from "../common/commonResponses.js";
import { ApiCustomerSchema } from "../customers/apiCustomer.js";

export const ApiCustomerWithMeta = ApiCustomerSchema.meta({
	id: "Customer",
	// examples: [PLAN_EXAMPLE],
});

import {
	CreateCustomerParamsSchema,
	CreateCustomerQuerySchema,
	GetCustomerQuerySchema,
	ListCustomersResponseSchema,
	ListCustomersV2ParamsSchema,
	UpdateCustomerParamsSchema,
} from "../customers/customerOpModels.js";

export const customersOpenApi = {
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
	"/customers/list": {
		post: {
			summary: "List Customers",
			tags: ["customers"],
			requestBody: {
				content: {
					"application/json": { schema: ListCustomersV2ParamsSchema },
				},
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
};
