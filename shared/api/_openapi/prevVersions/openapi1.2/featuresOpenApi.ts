import { z } from "zod/v4";
import {
	getListResponseSchema,
	SuccessResponseSchema,
} from "../../../common/commonResponses.js";
import {
	ApiFeatureV0Schema,
	FEATURE_EXAMPLE,
} from "../../../features/prevVersions/apiFeatureV0.js";
import {
	CreateFeatureV0ParamsSchema,
	UpdateFeatureV0ParamsSchema,
} from "../../../features/prevVersions/featureV0OpModels.js";

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
