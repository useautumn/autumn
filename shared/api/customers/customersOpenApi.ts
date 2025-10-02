import { z } from "zod/v4";
import { APICustomerSchema } from "./apiCustomer.js";
import {
	CreateCustomerParamsSchema,
	ListCustomersResponseSchema,
	UpdateCustomerParamsSchema,
} from "./customerOpModels.js";
import { SuccessResponseSchema } from "../common/commonResponses.js";

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
				query: z.object({
					expand: z.string().optional(),
				}),
			},
			requestBody: {
				content: {
					"application/json": { schema: CreateCustomerParamsSchema },
				},
			},
			responses: {
				"200": {
					description: "200 OK",
					content: { "application/json": { schema: APICustomerSchema } },
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
				query: z.object({
					expand: z.string().optional(),
				}),
			},
			responses: {
				"200": {
					description: "200 OK",
					content: { "application/json": { schema: APICustomerSchema } },
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
					content: { "application/json": { schema: APICustomerSchema } },
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
