import {
	AttachResultSchema,
	CheckoutResponseSchema,
	ExtAttachBodySchema,
	ExtCheckoutParamsSchema,
} from "@api/models.js";
import {
	CancelBodySchema,
	CancelResultSchema,
	QueryParamsSchema,
	QueryResultSchema,
	TrackParamsSchema,
	TrackResultSchema,
} from "./coreOpModels.js";

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
	},
};
