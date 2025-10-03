import { EntityExpand } from "@models/cusModels/entityModels/entityExpand.js";
import { z } from "zod/v4";
import { SuccessResponseSchema } from "../common/commonResponses.js";
import { APIEntitySchema } from "./apiEntity.js";
import { CreateEntityParamsSchema } from "./entityOpModels.js";

const EntityListResponseSchema = z
	.object({
		data: z.array(APIEntitySchema),
	})
	.meta({
		id: "EntityListResponse",
	});

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
					content: { "application/json": { schema: APIEntitySchema } },
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
					expand: z.array(z.enum(EntityExpand)).optional(),
				}),
			},
			responses: {
				"200": {
					description: "200 OK",
					content: { "application/json": { schema: APIEntitySchema } },
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
