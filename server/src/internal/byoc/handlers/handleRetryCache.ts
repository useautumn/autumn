import { RetryByocCacheParamsSchema, Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { retryCache } from "../actions/lifecycle/retryCache.js";

export const handleRetryCache = createRoute({
	scopes: [Scopes.Organisation.Write],
	body: RetryByocCacheParamsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		return c.json(await retryCache({ ctx }));
	},
});
