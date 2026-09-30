import { DeleteByocCacheParamsSchema, Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { deleteCache } from "../actions/deleteCache.js";

export const handleDeleteCache = createRoute({
	scopes: [Scopes.Organisation.Write],
	body: DeleteByocCacheParamsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		await deleteCache({ ctx });
		return c.json({ success: true });
	},
});
