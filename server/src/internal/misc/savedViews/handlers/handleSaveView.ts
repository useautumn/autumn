import { RecaseError } from "@autumn/shared";
import { nanoid } from "nanoid";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { CacheManager } from "@/utils/cacheUtils/CacheManager.js";

const SaveViewSchema = z.object({
	name: z.string(),
	filters: z.any(),
});

/**
 * Save a new view for the organization
 */
export const handleSaveView = createRoute({
	body: SaveViewSchema,
	handler: async (c) => {
		const { org, env } = c.get("ctx");
		const { name, filters } = c.req.valid("json");

		if (!name) {
			throw new RecaseError({
				message: "Name is required",
			});
		}

		if (!filters) {
			throw new RecaseError({
				message: "Please select some filters first",
			});
		}

		const viewId = nanoid(8);
		const view = {
			id: viewId,
			name,
			filters,
			created_at: new Date().toISOString(),
			org_id: org.id,
		};

		// Save to Redis with key: saved_views:orgId:env:viewId (org+env scoped, no TTL)
		const key = `saved_views:${org.id}:${env}:${viewId}`;
		await CacheManager.setJson(key, view, "forever");

		// Also save to a list for easy retrieval
		const listKey = `saved_views_list:${org.id}:${env}`;
		const existingViews = (await CacheManager.getJson<string[]>(listKey)) || [];
		existingViews.push(viewId);
		await CacheManager.setJson(listKey, existingViews, "forever");

		return c.json({
			message: "View saved successfully",
			view: {
				id: viewId,
				name,
				created_at: view.created_at,
			},
		});
	},
});
