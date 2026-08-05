import { Scopes } from "@autumn/shared";
import {
	deleteSavedView,
	getSavedViewIdList,
	setSavedViewIdList,
} from "@/external/redis/actions/savedViewsStore/savedViewsStore.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";

/**
 * Delete a saved view for the organization
 */
export const handleDeleteView = createRoute({
	scopes: [Scopes.Public],
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { viewId } = c.req.param();

		await deleteSavedView({ ctx, viewId });

		const existingViews = await getSavedViewIdList({ ctx });
		const updatedViews = existingViews.filter((id) => id !== viewId);
		await setSavedViewIdList({ ctx, viewIds: updatedViews });

		return c.json({ message: "View deleted successfully" });
	},
});
