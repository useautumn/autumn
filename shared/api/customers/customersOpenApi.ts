import { z } from "zod/v4";
import { SuccessResponseSchema } from "../common/commonResponses.js";
import { ApiCustomerSchema } from "./apiCustomer.js";
import {
	CreateCustomerParamsSchema,
	CreateCustomerQuerySchema,
	GetCustomerQuerySchema,
	ListCustomersResponseSchema,
	UpdateCustomerParamsSchema,
} from "./customerOpModels.js";

// Register schema with .meta() for OpenAPI spec generation
export const ApiCustomerWithMeta = ApiCustomerSchema.meta({
	id: "Customer",
	description: "Customer object returned by the API",
});

export const customerOps = {
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
};
