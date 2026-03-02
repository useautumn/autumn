import {
	ApiCustomerSchema,
	BaseApiCustomerSchema,
	CreateCustomerParamsV0Schema,
	CreateCustomerQuerySchema,
	createPagePaginatedResponseSchema,
	GetCustomerQuerySchema,
	ListCustomersV2ParamsSchema,
	SuccessResponseSchema,
	UpdateCustomerParamsV0Schema,
} from "@autumn/shared";
import { z } from "zod/v4";

export const customersOpenApi = {
	"/customers": {
		post: {
			summary: "Create Customer",
			tags: ["customers"],
			requestParams: {
				query: CreateCustomerQuerySchema,
			},
			requestBody: {
				content: {
					"application/json": { schema: CreateCustomerParamsV0Schema },
				},
			},
			responses: {
				"200": {
					description: "200 OK",
					content: { "application/json": { schema: ApiCustomerSchema } },
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
						"application/json": {
							schema: createPagePaginatedResponseSchema(BaseApiCustomerSchema),
						},
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
					content: { "application/json": { schema: ApiCustomerSchema } },
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
					"application/json": { schema: UpdateCustomerParamsV0Schema },
				},
			},
			responses: {
				"200": {
					description: "200 OK",
					content: { "application/json": { schema: ApiCustomerSchema } },
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
