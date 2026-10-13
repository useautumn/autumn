import { RetryByocCacheParamsSchema, Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { retryShadowAtom } from "../actions/retryShadowAtom.js";

export const handleRetryShadowAtom = createRoute({
	scopes: [Scopes.Superuser],
	body: RetryByocCacheParamsSchema,
	handler: async (c) => c.json(await retryShadowAtom({ ctx: c.get("ctx") })),
});
