import { z } from "zod/v4";
import { UpdateBalancesParamsSchema } from "../balances/prevVersions/legacyUpdateBalanceModels.js";
import { SuccessResponseSchema } from "../common/commonResponses.js";
import { ApiCustomerSchema } from "./apiCustomer.js";
import {
	CreateCustomerParamsSchema,
	CreateCustomerQuerySchema,
	GetCustomerQuerySchema,
	ListCustomersQuerySchema,
	ListCustomersResponseSchema,
	UpdateCustomerParamsSchema,
} from "./customerOpModels.js";

// Note: The meta with id is added in openapi.ts to avoid duplicate registration
// This schema is exported through the main index and should not have an id here
export const ApiCustomerWithMeta = ApiCustomerSchema;

export const customerOps = {
	"/customers": {
		get: {
			summary: "List Customers",
			tags: ["customers"],
			requestParams: {
				query: ListCustomersQuerySchema,
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
			summary: "Update Feature Balances",
			description:
				"Update or set feature balances for a customer. Can set specific balance values or make features unlimited.",
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
					description: "200 OK",
					content: {
						"application/json": { schema: SuccessResponseSchema },
					},
				},
			},
		},
	},
};
