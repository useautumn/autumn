import { GetAtomMetricsParamsSchema, Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { getShadowAtomMetrics } from "../actions/getShadowAtomMetrics.js";

export const handleGetShadowAtomMetrics = createRoute({
	scopes: [Scopes.Superuser],
	body: GetAtomMetricsParamsSchema,
	handler: async (c) =>
		c.json(await getShadowAtomMetrics({ params: c.req.valid("json") })),
});
