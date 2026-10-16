import { IncreaseByocCacheStorageParamsSchema, Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { increaseCacheStorage } from "../actions/lifecycle/increaseCacheStorage.js";

export const handleIncreaseCacheStorage = createRoute({
	scopes: [Scopes.Organisation.Write],
	body: IncreaseByocCacheStorageParamsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const params = c.req.valid("json");
		return c.json(await increaseCacheStorage({ ctx, params }));
	},
});
