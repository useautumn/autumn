import { APIFeatureSchema } from "./apiFeature.js";
import {
	CreateFeatureParamsSchema,
	UpdateFeatureParamsSchema,
} from "./featureOpModels.js";
import { z } from "zod/v4";
import { SuccessResponseSchema } from "../common/commonResponses.js";

const FeatureListResponseSchema = z
	.object({
		list: z.array(APIFeatureSchema),
	})
	.meta({
		id: "FeatureListResponse",
	});

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
					content: { "application/json": { schema: FeatureListResponseSchema } },
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
					content: { "application/json": { schema: APIFeatureSchema } },
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
					content: { "application/json": { schema: APIFeatureSchema } },
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
					content: { "application/json": { schema: APIFeatureSchema } },
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
