import { Scopes } from "@autumn/shared";
import {
	getSavedView,
	getSavedViewIdList,
} from "@/external/redis/actions/savedViewsStore/savedViewsStore.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";

/**
 * Get all saved views for the organization
 */
export const handleGetViews = createRoute({
	scopes: [Scopes.Public],
	handler: async (c) => {
		const ctx = c.get("ctx");

		const viewIds = await getSavedViewIdList({ ctx });

		const views = [];
		for (const viewId of viewIds) {
			const view = await getSavedView({ ctx, viewId });

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
