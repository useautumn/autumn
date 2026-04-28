import {
	CheckResponseV1Schema,
	ExtCheckParamsSchema,
	setUsageJsDoc,
	SetUsageParamsSchema,
	SuccessResponseSchema,
	TrackParamsSchema,
	TrackResponseV1Schema,
} from "@autumn/shared";
import type { ZodOpenApiPathsObject } from "zod-openapi";

export const coreOpenApi: ZodOpenApiPathsObject = {
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
					description: "",
					content: { "application/json": { schema: TrackResponseV1Schema } },
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
					"application/json": { schema: ExtCheckParamsSchema },
				},
			},
			responses: {
				"200": {
					description: "",
					content: { "application/json": { schema: CheckResponseV1Schema } },
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
					description: "",
					content: { "application/json": { schema: SuccessResponseSchema } },
				},
			},
		},
	},
};
