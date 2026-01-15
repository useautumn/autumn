import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { CacheManager } from "@/utils/cacheUtils/CacheManager.js";

/**
 * Delete a saved view for the organization
 */
export const handleDeleteView = createRoute({
	handler: async (c) => {
		const { org, env } = c.get("ctx");
		const { viewId } = c.req.param();

		// Delete from Redis
		const key = `saved_views:${org.id}:${env}:${viewId}`;
		await CacheManager.invalidate({
			action: "",
			value: key.replace(":", ""),
		});

		// Remove from list
		const listKey = `saved_views_list:${org.id}:${env}`;
		const existingViews =
			(await CacheManager.getJson<string[]>(listKey)) || [];
		const updatedViews = existingViews.filter((id: string) => id !== viewId);
		await CacheManager.setJson(listKey, updatedViews, "forever");

		return c.json({ message: "View deleted successfully" });
	},
});
