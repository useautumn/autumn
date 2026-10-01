import { ResizeByocCacheParamsSchema, Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { resizeCache } from "../actions/resizeCache.js";

export const handleResizeCache = createRoute({
	scopes: [Scopes.Organisation.Write],
	body: ResizeByocCacheParamsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const params = c.req.valid("json");
		return c.json(await resizeCache({ ctx, params }));
	},
});
