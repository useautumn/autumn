import type { ZodOpenApiPathsObject } from "zod-openapi";
import { TrackParamsSchema } from "../../../balances/track/trackParams.js";
import { SetUsageParamsSchema } from "../../../balances/usageModels.js";
import { SuccessResponseSchema } from "../../../common/commonResponses.js";
import { setUsageJsDoc } from "../../../common/jsDocs.js";
import {
	CheckResponseV1Schema,
	ExtCheckParamsSchema,
	TrackResponseV1Schema,
} from "../../../models.js";

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
