import {
	ApiPlanV0Schema,
	CreatePlanParamsV1Schema,
	ListPlansQuerySchema,
	SuccessResponseSchema,
	UpdatePlanParamsV1Schema,
} from "@autumn/shared";
import { z } from "zod/v4";

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
					"application/json": { schema: CreatePlanParamsV1Schema },
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
					"application/json": { schema: UpdatePlanParamsV1Schema },
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
