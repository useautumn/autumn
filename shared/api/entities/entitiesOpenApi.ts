import { EntityExpand } from "@models/cusModels/entityModels/entityExpand.js";
import { z } from "zod/v4";
import { SuccessResponseSchema } from "../common/commonResponses.js";
import { queryStringArray } from "../common/queryHelpers.js";
import { ApiEntitySchema } from "./apiEntity.js";
import { CreateEntityParamsSchema } from "./entityOpModels.js";

// Note: The meta with id is added in openapi.ts to avoid duplicate registration
// This schema is exported through the main index and should not have an id here
export const ApiEntityWithMeta = ApiEntitySchema;

export const entityOps = {
	"/customers/{customer_id}/entities": {
		post: {
			summary: "Create Entity",
			tags: ["entities"],
			requestParams: {
				path: z.object({
					customer_id: z.string(),
				}),
			},
			requestBody: {
				content: {
					"application/json": { schema: CreateEntityParamsSchema },
				},
			},
			responses: {
				"200": {
					description: "200 OK",
					content: { "application/json": { schema: ApiEntityWithMeta } },
				},
			},
		},
	},
	"/customers/{customer_id}/entities/{entity_id}": {
		get: {
			summary: "Get Entity",
			tags: ["entities"],
			requestParams: {
				path: z.object({
					customer_id: z.string(),
					entity_id: z.string(),
				}),
				query: z.object({
					expand: queryStringArray(z.enum(EntityExpand)).optional(),
				}),
			},
			responses: {
				"200": {
					description: "200 OK",
					content: { "application/json": { schema: ApiEntityWithMeta } },
				},
			},
		},
		delete: {
			summary: "Delete Entity",
			tags: ["entities"],
			requestParams: {
				path: z.object({
					customer_id: z.string(),
					entity_id: z.string(),
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
