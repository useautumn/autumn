import { z } from "zod/v4";
import {
	getListResponseSchema,
	SuccessResponseSchema,
} from "../common/commonResponses.js";
import { ApiFeatureSchema, FEATURE_EXAMPLE } from "./apiFeature.js";
import {
	CreateFeatureParamsSchema,
	UpdateFeatureParamsSchema,
} from "./featureOpModels.js";

// Register the schema with .meta() for OpenAPI spec generation
export const ApiFeatureWithMeta = ApiFeatureSchema.extend({
	type: z.enum(["boolean", "single_use", "continuous_use", "credit_system"]),
}).meta({
	id: "Feature",
	description: "",
	example: FEATURE_EXAMPLE,
});

export const featureOps = {
	"/features": {
		get: {
			summary: "List Features",
			tags: ["features"],
			responses: {
				"200": {
					description: "",
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
					description: "",
					content: { "application/json": { schema: ApiFeatureWithMeta } },
				},
			},
		},
	},
	"/features/{feature_id}": {
		get: {
			summary: "Get Feature",
			tags: ["features"],
			requestParams: {
				path: z.object({
					feature_id: z.string(),
				}),
			},
			responses: {
				"200": {
					description: "",
					content: { "application/json": { schema: ApiFeatureWithMeta } },
				},
			},
		},
		post: {
			summary: "Update Feature",
			tags: ["features"],
			requestParams: {
				path: z.object({
					feature_id: z.string(),
				}),
			},
			requestBody: {
				content: {
					"application/json": { schema: UpdateFeatureParamsSchema },
				},
			},
			responses: {
				"200": {
					description: "",
					content: { "application/json": { schema: ApiFeatureWithMeta } },
				},
			},
		},
		delete: {
			summary: "Delete Feature",
			tags: ["features"],
			requestParams: {
				path: z.object({
					feature_id: z.string(),
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
};
