import { GetByocCacheParamsSchema, Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { getCache } from "../actions/lifecycle/getCache.js";

export const handleGetCache = createRoute({
	scopes: [Scopes.Organisation.Read],
	body: GetByocCacheParamsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		return c.json(await getCache({ ctx }));
	},
});
