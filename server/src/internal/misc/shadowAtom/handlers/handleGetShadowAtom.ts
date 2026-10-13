import { GetByocCacheParamsSchema, Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { getShadowAtom } from "../actions/getShadowAtom.js";

export const handleGetShadowAtom = createRoute({
	scopes: [Scopes.Superuser],
	body: GetByocCacheParamsSchema,
	handler: async (c) => c.json(await getShadowAtom()),
});
