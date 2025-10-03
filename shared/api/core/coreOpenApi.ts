import {
	AttachResultSchema,
	CheckoutResponseSchema,
	ExtAttachBodySchema,
	ExtCheckoutParamsSchema,
} from "@api/models.js";
import type { ZodOpenApiPathsObject } from "zod-openapi";
import { CheckParamsSchema, CheckResultSchema } from "./checkModels.js";
import {
	BillingPortalParamsSchema,
	BillingPortalResultSchema,
	CancelBodySchema,
	CancelResultSchema,
	QueryParamsSchema,
	QueryResultSchema,
	SetupPaymentParamsSchema,
	SetupPaymentResultSchema,
	TrackParamsSchema,
	TrackResultSchema,
} from "./coreOpModels.js";

export const coreOps: ZodOpenApiPathsObject = {
	"/attach": {
		post: {
			summary: "Attach Product",
			description:
				"Enables a product and handles a payment if the customer's card is already on file.",

			tags: ["core"],
			requestBody: {
				content: {
					"application/json": {
						schema: ExtAttachBodySchema,
						example: {
							customer_id: "123",
							product_id: "pro",
						},
					},
				},
			},
			responses: {
				"200": {
					description: "200 OK",
					content: { "application/json": { schema: AttachResultSchema } },
				},
			},
		},
	},
	"/checkout": {
		post: {
			summary: "Checkout",
			tags: ["core"],
			requestBody: {
				content: { "application/json": { schema: ExtCheckoutParamsSchema } },
			},
			responses: {
				"200": {
					description: "200 OK",
					content: { "application/json": { schema: CheckoutResponseSchema } },
				},
			},
		},
	},
	"/cancel": {
		post: {
			summary: "Cancel Product",
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
			tags: ["core"],
			requestBody: {
				content: {
					"application/json": { schema: TrackParamsSchema },
				},
			},
			responses: {
				"200": {
					description: "200 OK",
					content: { "application/json": { schema: TrackResultSchema } },
				},
			},
		},
	},
	"/query": {
		post: {
			summary: "Query Analytics",
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
			tags: ["core"],
			requestBody: {
				content: {
					"application/json": { schema: CheckParamsSchema },
				},
			},
			responses: {
				"200": {
					description: "200 OK",
					content: { "application/json": { schema: CheckResultSchema } },
				},
			},
		},
	},
	"/setup_payment": {
		post: {
			summary: "Setup Payment Method",
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
	"/billing_portal": {
		post: {
			summary: "Create Billing Portal Session",
			tags: ["core"],
			requestBody: {
				content: {
					"application/json": { schema: BillingPortalParamsSchema },
				},
			},
			responses: {
				"200": {
					description: "200 OK",
					content: {
						"application/json": { schema: BillingPortalResultSchema },
					},
				},
			},
		},
	},
};
