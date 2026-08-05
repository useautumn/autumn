import { RecaseError, Scopes } from "@autumn/shared";
import { nanoid } from "nanoid";
import { z } from "zod/v4";
import {
	getSavedViewIdList,
	setSavedView,
	setSavedViewIdList,
} from "@/external/redis/actions/savedViewsStore/savedViewsStore.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";

const SaveViewSchema = z.object({
	name: z.string(),
	filters: z.any(),
});

/**
 * Save a new view for the organization
 */
export const handleSaveView = createRoute({
	scopes: [Scopes.Public],
	body: SaveViewSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { org } = ctx;
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

		await setSavedView({ ctx, view });

		const existingViews = await getSavedViewIdList({ ctx });
		existingViews.push(viewId);
		await setSavedViewIdList({ ctx, viewIds: existingViews });

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
