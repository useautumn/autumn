import { z } from "zod/v4";
import { SuccessResponseSchema } from "../common/commonResponses.js";
import {
	CreatePlanParamsSchema,
	ListPlansQuerySchema,
	UpdatePlanParamsSchema,
} from "../products/crud/planOpModels.js";
import { ApiPlanV0Schema } from "../products/previousVersions/apiPlanV0.js";

export const ApiPlanWithMeta = ApiPlanV0Schema.meta({
	id: "Plan",
	// examples: [PLAN_EXAMPLE],
});

export const plansOpenApi = {
	"/plans": {
		get: {
			summary: "List Plans",
			tags: ["plans"],
			requestParams: {
				query: ListPlansQuerySchema,
			},
			responses: {
				"200": {
					description: "",
					content: {
						"application/json": {
							schema: z.object({
								list: z.array(ApiPlanWithMeta),
							}),
						},
					},
				},
			},
		},
		post: {
			summary: "Create Product",
			tags: ["products"],
			requestBody: {
				content: {
					"application/json": { schema: CreatePlanParamsSchema },
				},
			},
			responses: {
				"200": {
					description: "",
					content: { "application/json": { schema: ApiPlanWithMeta } },
				},
			},
		},
	},
	"/plans/{plan_id}": {
		get: {
			summary: "Get Plan",
			tags: ["plans"],
			requestParams: {
				path: z.object({
					plan_id: z.string(),
				}),
			},
			responses: {
				"200": {
					description: "",
					content: { "application/json": { schema: ApiPlanWithMeta } },
				},
			},
		},
		post: {
			summary: "Update Plan",
			tags: ["plans"],
			requestParams: {
				path: z.object({
					plan_id: z.string(),
				}),
			},
			requestBody: {
				content: {
					"application/json": { schema: UpdatePlanParamsSchema },
				},
			},
			responses: {
				"200": {
					description: "",
					content: { "application/json": { schema: ApiPlanWithMeta } },
				},
			},
		},
		delete: {
			summary: "Delete Plan",
			tags: ["plans"],
			requestParams: {
				path: z.object({
					plan_id: z.string(),
				}),
				query: z.object({
					all_versions: z.boolean().optional(),
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
