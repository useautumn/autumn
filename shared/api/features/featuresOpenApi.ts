import { z } from "zod/v4";
import {
	getListResponseSchema,
	SuccessResponseSchema,
} from "../common/commonResponses.js";
import { ApiFeatureSchema } from "./apiFeature.js";
import {
	CreateFeatureParamsSchema,
	UpdateFeatureParamsSchema,
} from "./featureOpModels.js";

// Note: The meta with id is added in openapi.ts to avoid duplicate registration
// This schema is exported through the main index and should not have an id here
export const ApiFeatureWithMeta = ApiFeatureSchema;

export const featureOps = {
	"/features": {
		get: {
			summary: "List Features",
			tags: ["features"],
			requestParams: {
				query: z.object({
					include_archived: z.boolean().optional(),
				}),
			},
			responses: {
				"200": {
					description: "200 OK",
					content: {
						"application/json": {
							schema: getListResponseSchema({ schema: ApiFeatureWithMeta }),
						},
					},
				},
			},
		},
		post: {
			summary: "Create Feature",
			tags: ["features"],
			requestBody: {
				content: {
					"application/json": { schema: CreateFeatureParamsSchema },
				},
			},
			responses: {
				"200": {
					description: "200 OK",
					content: { "application/json": { schema: ApiFeatureWithMeta } },
				},
			},
		},
	},
	"/features/{featureId}": {
		get: {
			summary: "Get Feature",
			tags: ["features"],
			requestParams: {
				path: z.object({
					featureId: z.string(),
				}),
			},
			responses: {
				"200": {
					description: "200 OK",
					content: { "application/json": { schema: ApiFeatureWithMeta } },
				},
			},
		},
		post: {
			summary: "Update Feature",
			tags: ["features"],
			requestParams: {
				path: z.object({
					featureId: z.string(),
				}),
			},
			requestBody: {
				content: {
					"application/json": { schema: UpdateFeatureParamsSchema },
				},
			},
			responses: {
				"200": {
					description: "200 OK",
					content: { "application/json": { schema: ApiFeatureWithMeta } },
				},
			},
		},
		delete: {
			summary: "Delete Feature",
			tags: ["features"],
			requestParams: {
				path: z.object({
					featureId: z.string(),
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
