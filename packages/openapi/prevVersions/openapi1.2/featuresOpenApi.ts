import {
	ApiFeatureV0Schema,
	CreateFeatureV0ParamsSchema,
	FEATURE_EXAMPLE,
	getListResponseSchema,
	SuccessResponseSchema,
	UpdateFeatureV0ParamsSchema,
} from "@autumn/shared";
import { z } from "zod/v4";

export const ApiFeatureWithMeta = ApiFeatureV0Schema.extend({
	type: z.enum(["boolean", "single_use", "continuous_use", "credit_system"]),
}).meta({
	id: "Feature",
	examples: [FEATURE_EXAMPLE],
});

export const featuresOpenApi = {
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
					"application/json": { schema: CreateFeatureV0ParamsSchema },
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
					"application/json": { schema: UpdateFeatureV0ParamsSchema },
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
