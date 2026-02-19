import { SuccessResponseSchema } from "@api/common";
import { CreateEntityParamsV0Schema } from "@api/entities/crud/createEntityParams";
import {
	API_ENTITY_V0_EXAMPLE,
	ApiEntityV0Schema,
	queryStringArray,
} from "@autumn/shared";
import { EntityExpandV0 } from "@models/cusModels/entityModels/entityExpand.js";
import { z } from "zod/v4";

// Note: The meta with id is added in openapi.ts to avoid duplicate registration
// This schema is exported through the main index and should not have an id here
export const ApiEntityWithMeta = ApiEntityV0Schema.meta({
	id: "Entity",
	example: API_ENTITY_V0_EXAMPLE,
});

export const entitiesOpenApi = {
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
					"application/json": { schema: CreateEntityParamsV0Schema },
				},
			},
			responses: {
				"200": {
					description: "",
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
					expand: queryStringArray(z.enum(EntityExpandV0)).optional(),
				}),
			},
			responses: {
				"200": {
					description: "",
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
