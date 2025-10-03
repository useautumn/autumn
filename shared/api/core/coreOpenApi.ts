import {
	AttachResultSchema,
	CheckoutResponseSchema,
	ExtAttachBodySchema,
	ExtCheckoutParamsSchema,
} from "@api/models.js";
import {
	createJSDocDescription,
	docLink,
	example,
} from "@api/utils/openApiHelpers.js";
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

const attachJsDoc = createJSDocDescription({
	description:
		"Enables a product for a customer and processes payment if their payment method is already on file.",
	whenToUse:
		"Use this when the customer already has a payment method saved. For new customers without payment info, use `checkout` instead.",
	body: ExtAttachBodySchema,
	examples: [
		example({
			values: {
				customer_id: "cus_123",
				product_id: "pro_plan",
			},
			description: "Attach a product to a customer",
		}),
	],
	methodName: "attach",
	docs: [
		docLink({
			url: "https://docs.useautumn.com/api-reference/core/attach",
			title: "Product Attachments",
		}),
	],
});

export const coreOps: ZodOpenApiPathsObject = {
	"/attach": {
		post: {
			summary: "Attach Product",
			description: attachJsDoc,

			tags: ["core"],
			requestBody: {
				content: {
					"application/json": {
						schema: ExtAttachBodySchema,
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
							schema: AttachResultSchema,
						},
					},
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
