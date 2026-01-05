import { z } from "zod/v4";
import { SuccessResponseSchema } from "../common/commonResponses.js";
import {
	ApiCustomerSchema,
	BaseApiCustomerSchema,
} from "../customers/apiCustomer.js";

// export const ApiCustomerWithMeta = ApiCustomerSchema.meta({
// 	id: "Customer",
// 	// examples: [PLAN_EXAMPLE],
// });

import { ListCustomersV2ParamsSchema } from "../customers/crud/listCustomersParamsV2.js";
import {
	CreateCustomerParamsSchema,
	CreateCustomerQuerySchema,
	GetCustomerQuerySchema,
	// ListCustomersResponseSchema,
	UpdateCustomerParamsSchema,
} from "../customers/customerOpModels.js";
import { createPagePaginatedResponseSchema } from "../models.js";

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
					"application/json": { schema: CreateCustomerParamsSchema },
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
					"application/json": { schema: UpdateCustomerParamsSchema },
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
