import { CreateByocCacheParamsSchema, Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { createCache } from "../actions/createCache.js";

export const handleCreateCache = createRoute({
	scopes: [Scopes.Organisation.Write],
	body: CreateByocCacheParamsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const params = c.req.valid("json");
		return c.json(await createCache({ ctx, params }));
	},
});
