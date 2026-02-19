import {
	attachJsDoc,
	billingPortalJsDoc,
	cancelJsDoc,
	checkoutJsDoc,
	queryJsDoc,
	setupPaymentJsDoc,
} from "@api/common/jsDocs.js";
import {
	GetBillingPortalBodySchema,
	GetBillingPortalResponseSchema,
} from "@api/customers/customerOpModels.js";
import {
	AttachBodyV0Schema,
	AttachResponseV1Schema,
	CancelBodySchema,
	CancelResultSchema,
	CheckoutParamsV0Schema,
	CheckoutResponseV0Schema,
	CheckResponseV2Schema,
	ExtCheckParamsSchema,
	QueryParamsSchema,
	QueryResultSchema,
	SetupPaymentParamsSchema,
	SetupPaymentResultSchema,
	TrackParamsSchema,
	TrackResponseV2Schema,
} from "@api/models.js";
import { z } from "zod/v4";
import type { ZodOpenApiPathsObject } from "zod-openapi";

export const coreOps: ZodOpenApiPathsObject = {
	"/attach": {
		post: {
			summary: "Attach Product",
			description: attachJsDoc,

			tags: ["core"],
			requestBody: {
				content: {
					"application/json": {
						schema: AttachBodyV0Schema,
						examples: {
							basic: {
								summary: "Attach a product immediately",
								description:
									"Enable a product for a customer with immediate activation",
								value: {
									customer_id: "cus_123",
									product_id: "pro_plan",
								},
							},
						},
					},
				},
			},
			responses: {
				"200": {
					description: "Product attached successfully",
					content: {
						"application/json": {
							schema: AttachResponseV1Schema,
						},
					},
				},
			},
		},
	},
	"/checkout": {
		post: {
			summary: "Checkout",
			description: checkoutJsDoc,
			tags: ["core"],
			requestBody: {
				content: { "application/json": { schema: CheckoutParamsV0Schema } },
			},
			responses: {
				"200": {
					description: "200 OK",
					content: { "application/json": { schema: CheckoutResponseV0Schema } },
				},
			},
		},
	},
	"/cancel": {
		post: {
			summary: "Cancel Product",
			description: cancelJsDoc,
			tags: ["core"],
			requestBody: {
				content: {
					"application/json": { schema: CancelBodySchema },
				},
			},
			responses: {
				"200": {
					description: "200 OK",
					content: { "application/json": { schema: CancelResultSchema } },
				},
			},
		},
	},
	"/track": {
		post: {
			summary: "Track Event",
			// description: trackJsDoc,
			tags: ["core"],
			requestBody: {
				content: {
					"application/json": { schema: TrackParamsSchema },
				},
			},
			responses: {
				"200": {
					description: "200 OK",
					content: { "application/json": { schema: TrackResponseV2Schema } },
				},
			},
		},
	},
	"/query": {
		post: {
			summary: "Query Analytics",
			description: queryJsDoc,
			tags: ["core"],
			requestBody: {
				content: {
					"application/json": { schema: QueryParamsSchema },
				},
			},
			responses: {
				"200": {
					description: "200 OK",
					content: { "application/json": { schema: QueryResultSchema } },
				},
			},
		},
	},
	"/check": {
		post: {
			summary: "Check Feature Access",
			description: checkoutJsDoc,
			tags: ["core"],
			requestBody: {
				content: {
					"application/json": { schema: ExtCheckParamsSchema },
				},
			},
			responses: {
				"200": {
					description: "200 OK",
					content: { "application/json": { schema: CheckResponseV2Schema } },
				},
			},
		},
	},
	"/setup_payment": {
		post: {
			summary: "Setup Payment Method",
			description: setupPaymentJsDoc,
			tags: ["core"],
			requestBody: {
				content: {
					"application/json": { schema: SetupPaymentParamsSchema },
				},
			},
			responses: {
				"200": {
					description: "200 OK",
					content: { "application/json": { schema: SetupPaymentResultSchema } },
				},
			},
		},
	},

	"/customers/{customer_id}/billing_portal": {
		post: {
			summary: "Create Billing Portal Session",
			description: billingPortalJsDoc,
			tags: ["core"],
			requestParams: {
				path: z.object({
					customer_id: z.string(),
				}),
				// query: GetBillingPortalQuerySchema,
			},
			requestBody: {
				content: {
					"application/json": {
						schema: GetBillingPortalBodySchema,
					},
				},
			},
			responses: {
				"200": {
					description: "200 OK",
					content: {
						"application/json": {
							schema: GetBillingPortalResponseSchema,
						},
					},
				},
			},
		},
	},
};
