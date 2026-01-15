import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { CacheManager } from "@/utils/cacheUtils/CacheManager.js";

/**
 * Get all saved views for the organization
 */
export const handleGetViews = createRoute({
	handler: async (c) => {
		const { org, env } = c.get("ctx");

		const listKey = `saved_views_list:${org.id}:${env}`;
		const viewIds = (await CacheManager.getJson<string[]>(listKey)) || [];

		const views = [];
		for (const viewId of viewIds) {
			const key = `saved_views:${org.id}:${env}:${viewId}`;
			const view = await CacheManager.getJson<{
				id: string;
				name: string;
				filters: any;
				created_at: string;
			}>(key);

			if (view) {
				views.push({
					id: view.id,
					name: view.name,
					filters: view.filters,
					created_at: view.created_at,
				});
			}
		}

		// Sort by creation date (newest first)
		views.sort(
			(a, b) =>
				new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
		);

		return c.json({ views });
	},
});
