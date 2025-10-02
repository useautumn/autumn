import { z } from "zod/v4";
import { APIEntitySchema } from "./apiEntity.js";
import { CreateEntityParamsSchema } from "./entityOpModels.js";
import { SuccessResponseSchema } from "../common/commonResponses.js";

const EntityListResponseSchema = z
	.object({
		data: z.array(APIEntitySchema),
	})
	.meta({
		id: "EntityListResponse",
	});

export const entityOps = {
	"/customers/{customer_id}/entities": {
		get: {
			summary: "List Entities",
			tags: ["entities"],
			requestParams: {
				path: z.object({
					customer_id: z.string(),
				}),
				query: z.object({
					expand: z.string().optional(),
				}),
			},
			responses: {
				"200": {
					description: "200 OK",
					content: {
						"application/json": {
							schema: EntityListResponseSchema,
						},
					},
				},
			},
		},
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
					expand: z.string().optional(),
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
