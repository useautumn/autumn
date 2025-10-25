import {
	AttachResultSchema,
	CheckoutResponseSchema,
	ExtAttachBodySchema,
	ExtCheckoutParamsSchema,
} from "@api/models.js";
import type { ZodOpenApiPathsObject } from "zod-openapi";
import { SetUsageParamsSchema } from "../balances/usageModels.js";
import { SuccessResponseSchema } from "../common/commonResponses.js";
import {
	attachJsDoc,
	billingPortalJsDoc,
	cancelJsDoc,
	checkJsDoc,
	checkoutJsDoc,
	queryJsDoc,
	setUsageJsDoc,
	setupPaymentJsDoc,
	trackJsDoc,
} from "../common/jsDocs.js";
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
			description: checkoutJsDoc,
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
			description: trackJsDoc,
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
			description: checkJsDoc,
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
	"/billing_portal": {
		post: {
			summary: "Create Billing Portal Session",
			description: billingPortalJsDoc,
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

	"/usage": {
		post: {
			summary: "Set Usage",
			description: setUsageJsDoc,
			tags: ["core"],
			requestBody: {
				content: {
					"application/json": { schema: SetUsageParamsSchema },
				},
			},
			responses: {
				"200": {
					description: "200 OK",
					content: { "application/json": { schema: SuccessResponseSchema } },
				},
			},
		},
	},
};
