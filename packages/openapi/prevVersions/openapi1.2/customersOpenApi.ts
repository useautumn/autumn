import { UpdateBalancesParamsSchema } from "@api/balances/prevVersions/legacyUpdateBalanceModels.js";
import { SuccessResponseSchema } from "@api/common/commonResponses.js";
import { queryStringArray } from "@api/common/queryHelpers.js";
import {
	BillingPortalParamsSchema,
	BillingPortalResultSchema,
} from "@api/core/coreOpModels.js";
import { CustomerExpandEnum } from "@api/customers/components/customerExpand/customerExpand.js";
import { CreateCustomerParamsV0Schema } from "@api/customers/crud/createCustomerParams.js";
import { UpdateCustomerParamsV0Schema } from "@api/customers/crud/updateCustomerParams.js";
import {
	ListCustomersQuerySchema,
	ListCustomersResponseSchema,
} from "@api/customers/customerOpModels.js";
import {
	API_CUSTOMER_V3_EXAMPLE,
	ApiCustomerV3Schema,
} from "@api/customers/previousVersions/apiCustomerV3.js";
import { z } from "zod/v4";

export const ApiCustomerWithMeta = ApiCustomerV3Schema.meta({
	id: "Customer",
	example: API_CUSTOMER_V3_EXAMPLE,
});

export const customersOpenApi = {
	"/customers": {
		get: {
			summary: "List Customers",
			tags: ["customers"],
			requestParams: {
				query: ListCustomersQuerySchema,
			},
			responses: {
				"200": {
					description: "",
					content: {
						"application/json": {
							schema: ListCustomersResponseSchema.extend({
								list: z.array(
									ApiCustomerWithMeta.omit({
										entities: true,
										invoices: true,
										trials_used: true,
										referrals: true,
										payment_method: true,
									}),
								),
							}),
						},
					},
				},
			},
		},
		post: {
			summary: "Create Customer",
			tags: ["customers"],
			requestParams: {
				query: z.object({
					expand: queryStringArray(CustomerExpandEnum).optional(),
				}),
			},
			requestBody: {
				content: {
					"application/json": { schema: CreateCustomerParamsV0Schema },
				},
			},
			responses: {
				"200": {
					description: "",
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
					customer_id: z.string().meta({
						description: "The ID of the customer.",
					}),
				}),
				query: z.object({
					expand: queryStringArray(CustomerExpandEnum).optional(),
				}),
			},
			responses: {
				"200": {
					description: "",
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
			},
			requestBody: {
				content: {
					"application/json": { schema: UpdateCustomerParamsV0Schema },
				},
			},
			responses: {
				"200": {
					description: "",
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
				query: z.object({
					delete_in_stripe: z.boolean().default(false).meta({
						description:
							"Whether to delete the customer and cancel all existing subscriptions in Stripe.",
					}),
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
	"/customers/{customer_id}/billing_portal": {
		post: {
			summary: "Get Billing Portal URL",
			tags: ["customers"],
			requestParams: {
				path: z.object({
					customer_id: z.string(),
				}),
			},
			requestBody: {
				content: {
					"application/json": { schema: BillingPortalParamsSchema },
				},
			},
			responses: {
				"200": {
					description: "",
					content: {
						"application/json": { schema: BillingPortalResultSchema },
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
