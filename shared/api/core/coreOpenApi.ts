import {
	AttachResultSchema,
	CheckoutResponseSchema,
	ExtAttachBodySchema,
	ExtCheckoutParamsSchema,
} from "@api/models.js";

export const coreOps = {
	"/core": {
		"/attach": {
			post: {
				summary: "Attach Product",
				tags: ["core"],
				requestBody: {
					content: {
						"application/json": { schema: ExtAttachBodySchema },
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
	},
};
